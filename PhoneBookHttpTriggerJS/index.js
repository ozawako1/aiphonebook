var util = require('./util.js');
var mychatwork = require('./chatwork.js');
var sql = require("./sqldb.js");
var request_promise = require('request-promise');
var Promise = require('promise');

const TO_REG = /\[To:[0-9]*\].*\n/;
var my_config = require("../conf/config.js");

const CHATWORK_ID_ME = 2642322;
const CHATPOST_FORMAT = "さん？";

function get_garoon_schedules(result){

    var uri = my_config.cybozufunc.url;
    if (my_config.env.runningon == "Local"){
        uri = my_config.cybozufunc.url_local;
    }

    var options = {
        "method": "POST",
        "uri": uri,
        "qs": {
            "code": my_config.cybozufunc.code,
        },
        body: {
            "garoonid": result.userId.value,
            "now": true
        },
        headers: {
            'User-Agent': 'Request-Promise'
        },
        json: true // Automatically parses the JSON string in the response
    };
    
    return request_promise(options)
        .then(function (parsedBody) {
            // POST succeeded...
            return parsedBody;
        })
}

function get_time(date)
{
    var h = date.getHours();
    var m = date.getMinutes();

    h = ("00" + h).slice(-2);
    m = ("00" + m).slice(-2);

    return h + ":" + m;
}

function format_schedules(evts, rslts) {

    var name = "";
    var evt = "";
    var arr = [];

    for( var i = 0 ; i < rslts.length ; i++){
        name = rslts[i].name.value;
        evt = "";
        for (var j = 0 ; j < evts[i].events.length ; j++){
            var st = new Date(evts[i].events[j].start.dateTime);
            var et = new Date(evts[i].events[j].end.dateTime);

            evt += get_time(st) + "-" + get_time(et) + " | " + evts[i].events[j].subject + "\n";
        }
        arr.push({"name":name, "event":evt});
    };

    return arr;
}

function get_schedule(results){

    var promises = results.map(item => get_garoon_schedules(item));
        
    return Promise.all(promises)
        .then((schedules) => format_schedules(schedules, results))
        .then(function(arr){
            return arr;
        })
        .catch(function(err){
            console.log("get_schedule error:" +err.message);
            return err;
        });
    
}

function post_chatwork(results, obj, org_msg){

    var total = "";

    for (var i = 0 ; i < results.length ; i++) {
        var msg = "";

        msg += results[i].name.value + "さんの連絡先は、\n";
        msg += "内線電話:" + results[i].extensionNumber.value + "\n";
        msg += "携帯電話:" + results[i].mobilePhone.value + "\n";

        total += msg;
        console.log("No." + (i+1) + " " + msg + "\n");
    }

    total += "\n BIZTEL prefix = 9 / Osaka prefix = 80";

    obj.Reply(org_msg, total);

    return results;
}

function post_chatwork_(results, obj, org_msg){

    var total = "";

    for (var i = 0 ; i < results.length ; i++) {
        var msg = "";

        if (results[i].event != "") {
            msg += results[i].name + "さんの予定、\n";
            msg += results[i].event + "\n";
        }

        total += msg;
    }

    if (total != "") {
        obj.Reply(org_msg, total);
    }

    return results;
}


function send_sorry(err, obj, org_msg) {
    
    var str = err.message;
    if (org_msg.debug) {
        str += err.stack;
    }
    var add = "\n「◯◯さん？」や「◯◯さんの連絡先を教えて」と聞いてみてください"

    obj.Reply(org_msg, "申し訳ありません。わかりませんでした。["+ str +"]" + add);
}

function check_whowhat(repos) {
    console.log('User has %s repos', repos.query);

    var who = "";
    var what = "";            
    
    return new Promise((resolve, reject) => {
       
        who = util.json_find(repos.entities, "who");

        if (repos.topScoringIntent.intent == "GetPhoneNumber") {            
            what = "phone";
        } else if (repos.topScoringIntent.intent == "GetSchedule") {
            what = "schedule";
        }
        
        if (who == "" || what == "") {
            reject(new Error("PhoneNumber / Schedule Only."));
        }

        resolve({"who": who, "what": what});
    });

}

function is_target_room(roomid) {

    var ret = true;

    if ((roomid == "82461612") ||   // 情シスbot（ベータ2版）
        (roomid == "68943669") ||   // 情報システム課
        (roomid == "75818614") ||   // 情シス委員会
        (roomid == "4952594")) {   // システム連絡用
        
        ret = false;
    }

    return ret;
}


module.exports = function (context, req) {

    context.log('HTTP trigger function processed a request.');

    var obj = null;
    var msg = null;
    var who = "";

    // 通信相手（user_agent）を見て、switch
    var ua = req.headers["user-agent"]; 

    if (ua.indexOf("ChatWork-Webhook/", 0) == 0 || req.body.debug == true) {
        
        //Chatwork
        msg = new mychatwork.CChatworkMessage(req.body);
        obj = new mychatwork.CWebServiceChatwork();

        context.log("qeury=[" + msg.body + "]");

        // 自分発信は無視。
        if (msg.from_id != CHATWORK_ID_ME && is_target_room(msg.room_id)) {
            
            //指定書式?
            var pos = msg.body.lastIndexOf(CHATPOST_FORMAT);
            if ( pos != -1 ) {                

                //chatworkの宛先表記を消す
                who = msg.body.substr(0, pos);
                who = who.replace(TO_REG, '');

                sql.query_phonebook({"who":who, "what":"phone"})
                    .then((results) => post_chatwork(results, obj, msg))
                    .catch(function(err){
                        send_sorry(err, obj, msg);
                    });

            } else {    

                //AIハツドウ！Azure LUIS
                var options = {
                    "uri": my_config.luis.url,
                    "qs": {
                        "subscription-key": my_config.luis.subscriptionkey,
                        "verbose": "true",
                        "timezoneOffset": "540",
                        "q": msg.body.replace(TO_REG, '')
                    },
                    "headers": {
                        'User-Agent': 'Request-Promise'
                    },
                    json: true // Automatically parses the JSON strng in the response
                };
                
                request_promise(options)
                    .then((repos) => check_whowhat(repos))
                    .then((whowhat) => sql.query_phonebook(whowhat))
                    .then((results) => post_chatwork(results, obj, msg))
//                    .then((results) => get_schedule(results))
//                    .then((arr) => post_chatwork_(arr, obj, msg))
                    .catch(function(err){
                        send_sorry(err, obj, msg);
                    });
            }

        }
    } else {
        context.log("UnKnown Client.");
    }

    context.res = {
        status: 200,
        body: "done."
    };                    
    context.done();

};