var util = require('./util.js');
var mychatwork = require('./chatwork.js');
var sql = require("./sqldb.js");
var request_promise = require('request-promise');
var Promise = require('promise');

const TO_REG = /\[To:[0-9]*\].*\n/;

const CHATWORK_ID_ME = 2642322;
const CHATPOST_FORMAT = "さん？";

const DUMMY_GAROON_ID = 9000;

const URL_GAROON_SCHEDULE_API = "https://1908groupwarefunc.azurewebsites.net/api/PostSchedule";
const URL_LUIS_API = "https://eastus.api.cognitive.microsoft.com/luis/v2.0/apps/1c88b3f7-3a27-4769-bd40-7a4c4d1c784e";

function get_garoon_schedules(results){

    var options = {
        "method": "GET",
        "uri": URL_GAROON_SCHEDULE_API,
        "qs": {
            "gid": results[0].userId.value,
            "code": process.env.MY_GAROON_SCHEDULE_API_CODE,
            "diff": 0
        },
        headers: {
            'User-Agent': 'Request-Promise'
        },
        json: true // Automatically parses the JSON string in the response
    };
    
    return request_promise(options)
        .then(function (parsedBody) {
            // POST succeeded...
            results[0].event = parsedBody;
            return results;
        })
}


function get_schedule(results){

    if (results.length == 1 && parseInt(results[0].userId.value.trim(),10) < DUMMY_GAROON_ID) {
        return get_garoon_schedules(results);
    } else {
        results[0].event = "n/a";
    }
    return results;
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

function post_chatwork_(results, obj, org_msg, schedule){

    var msg1 = "";
    var msg2 = "";

    if (results.length == 1) {
        msg1 = results[0].name.value + "さんの予定は、\n";
        msg2 = results[0].event;

        if (msg2 != "") {
            obj.Post(org_msg, msg1 + msg2);
        }
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
        (roomid == "136882950") ||  // いまどこ
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
    var ua = req.headers["user-agent"]; 

    if (ua.indexOf("ChatWork-Webhook/", 0) == 0) {
        
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
                    .then((results) => get_schedule(results))
                    .then((results) => post_chatwork_(results, obj, msg))
                    .catch(function(err){
                        send_sorry(err, obj, msg);
                    });

            } else {    

                //AIハツドウ！Azure LUIS
                var options = {
                    "uri": URL_LUIS_API,
                    "qs": {
                        "subscription-key": process.env.MY_LUIS_API_CODE,
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
                    .then((results) => get_schedule(results))
                    .then((results) => post_chatwork_(results, obj, msg))
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

