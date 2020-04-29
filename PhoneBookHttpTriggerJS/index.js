var util = require('./util.js');
var mychatwork = require('./chatwork.js');
var sql = require("./sqldb.js");
var request_promise = require('request-promise');
var Promise = require('promise');
var cdb = require('./cosmosdb.js');
var moment = require('moment-timezone');

const CHATWORK_ID_ME = 2642322;

const UNKNOWN_PURPOSE = 0;
const PURPOSE_PHONEBOOK = 1;
const PURPOSE_ZOOM = 2;

const REG_TO = /\[To:[0-9]*\].*\n/;
const CHATPOST_PHONEBOOK_FORMAT = "さん？";
const CHATPOST_ZOOM_FORMAT = "zoom";


const URL_GAROON_SCHEDULE_API = "https://garoonfuncj.azurewebsites.net/api/PostSchedule";
const URL_LUIS_API = "https://eastus.api.cognitive.microsoft.com/luis/v2.0/apps/1c88b3f7-3a27-4769-bd40-7a4c4d1c784e";

function get_garoon_schedules(results, from_email){

    var options = {
        "method": "GET",
        "uri": URL_GAROON_SCHEDULE_API,
        "qs": {
            "gid": results[0].userId.value.trim(),
            "femail": from_email[0].account_email,
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
        .catch(function(err){
            // only log error
            results[0].event = err.message;
            return results;
        });
}


function get_schedule(results, chatworkid){

    results[0].event = "n/a";

    return new Promise((resolve, reject) => {
        cdb.getemails_from_chatworkid(chatworkid)
            .then((emails) => get_garoon_schedules(results, emails))
            .then((results) => resolve(results))
            .catch((error) => reject(error));
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

    total += "\n Prefix: BIZTEL(9) / Osaka(80)";

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


function get_zoommeetings(results){

    var zoom_user_id = results[0].id.value;

    return new Promise((resolve, reject) => {
        var rp = require('request-promise');
        var op = {
            uri: process.env.MY_ZOOM_GETMEETINGS_URL,
            qs: {
                zuid: zoom_user_id
            },
            json: true
        };
        rp(op)
            .then((results) => resolve(results))
            .catch((error) => reject(error));
        });

}

function format_mtg(mtg)
{
    var fmt = "" + mtg.topic + "\n";
    if (mtg.start_time != undefined) {
        var dtime = moment(mtg.start_time).tz(mtg.timezone);
        fmt += "時間: " + dtime.format("YYYY/MM/DD HH:mm");
        if (mtg.duration != undefined && mtg.duration > 0) {

            fmt += " - " + dtime.add(mtg.duration, 'm').format("HH:mm");
        }
        fmt += "\n";
    }
    if (mtg.join_url != undefined) {
        fmt += "参加URL: " + mtg.join_url + " \n";
    }
    return fmt;
}

function post_chatwork3(results, who, obj, org_msg){

    var now = "";
    var next = "";

    for (var i = 0 ; i < results.length ; i++){
        var mtg = results[i];
        if (mtg.live == "true"){
            now += "現在、Zoom"+ who +" で以下のMTGが開催されています。\n";
            now += format_mtg(mtg);
            now += "\n";
        } else {
            if(next == ""){
                next = "今後、以下のMTGが予定されています。\n";
            }
            next += format_mtg(mtg);
        }
    }
    if (now == ""){
        now = "現在、Zoom"+ who +" で、開催中のMTGはありません。\n\n";
    }

    if (now != "" || next != "") {
        obj.Reply(org_msg, now + next);
    }

    return results;
}


function send_sorry(err, obj, org_msg) {
    
    var str = err.message;
    if (org_msg.debug) {
        str += err.stack;
    }
    var add = "\n「◯◯さん？」や「Zoom7」と聞いてみてください"

    obj.Reply(org_msg, "申し訳ありません。["+ str +"]" + add);
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


function get_msg_purpose(msg_body){

    var ret = { purpose: UNKNOWN_PURPOSE, msgcore: ""};

    var tmp = msg_body.replace(REG_TO, '');
    tmp = tmp.toLowerCase();

    if (msg_body.lastIndexOf(CHATPOST_PHONEBOOK_FORMAT) != -1) {
        ret.purpose = PURPOSE_PHONEBOOK;
        ret.msgcore = tmp.substring(0, tmp.lastIndexOf(CHATPOST_PHONEBOOK_FORMAT));
    } else if (tmp.indexOf(CHATPOST_ZOOM_FORMAT) != -1) {
        ret.purpose = PURPOSE_ZOOM;
        ret.msgcore = tmp.substring(tmp.indexOf(CHATPOST_ZOOM_FORMAT)+CHATPOST_ZOOM_FORMAT.length);
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
            var type = get_msg_purpose(msg.body);

            switch (type.purpose){
            case PURPOSE_PHONEBOOK:
                //「XXさん？」のXX部分
                who = type.msgcore;

                sql.query_phonebook({"who":who, "what":"phone"})
                    .then((results) => post_chatwork(results, obj, msg))
                    .then((results) => get_schedule(results, msg.from_id))
                    .then((results) => post_chatwork_(results, obj, msg))
                    .catch(function(err){
                        send_sorry(err, obj, msg);
                    });

                break;
            case PURPOSE_ZOOM:
                //「zoomNN」のNN部分
                who = type.msgcore;
                var email = "motex_zoom" + who + "@motex.co.jp";
                obj.is_internal_user(cdb, msg.from_id)
                .then((internal) => {
                    if (internal) {
                        sql.query_zoomusers(email)
                        .then((results) => get_zoommeetings(results))
                        .then((results) => post_chatwork3(results, who, obj, msg))
                        .catch(function(err) {
                            send_sorry(err, obj, msg);
                        });
                    }
                })
                .catch((err) => {
                    send_sorry(err, obj, msg);
                });
                break;
            default:
/*                //AIハツドウ
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
                    .then((results) => get_schedule(results, msg.from_id))
                    .then((results) => post_chatwork_(results, obj, msg))
                    .catch(function(err){
                        send_sorry(err, obj, msg);
                    });
*/
                break;
            } //switch
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

//curl -X POST -H "Content-Type: application/json" -H "User-Agent: ChatWork-Webhook/" -d @sample.dat http://localhost:7071/api/PhoneBookHttpTriggerJS