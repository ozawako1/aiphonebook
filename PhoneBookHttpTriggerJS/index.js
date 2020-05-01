var util = require('./util.js');
var mychatwork = require('./chatwork.js');
var sql = require("./sqldb.js");
var rp = require('request-promise');
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


const URL_LUIS_API = "https://eastus.api.cognitive.microsoft.com/luis/v2.0/apps/1c88b3f7-3a27-4769-bd40-7a4c4d1c784e";

function get_garoon_schedules(email){

    return new Promise((resolve, reject) => {
        var options = {
            "method": "GET",
            "uri": process.env.MY_GAROON_GETSCHEDULE_URL,
            "qs": {
                "target_user": email
            },
            headers: {
                'User-Agent': 'Request-Promise'
            },
            json: true // Automatically parses the JSON string in the response
        };
        rp(options)
            .then((respbody) => resolve(respbody))
            .catch((err) => reject(err));
    });

}

function post_chatwork(phonebook, obj, org_msg){

    var total = "";

    for (var i = 0 ; i < phonebook.length ; i++) {
        var msg = "";

        msg += phonebook[i].name.value + " さんの連絡先は、\n";
        msg += "内線電話:" + phonebook[i].extensionNumber.value + "\n";
        msg += "携帯電話:" + phonebook[i].mobilePhone.value + "\n";
        
        total += msg;
        console.log("No." + (i+1) + " " + msg + "\n");
    }

    total += "\n Prefix: BIZTEL(9) / Osaka(80)";

    obj.Reply(org_msg, total);

}

function get_time(date)
{
    if (date == "") {
        return date;
    }
    var m = moment(date).tz("Asia/Tokyo");
    return m.format("HH:mm");
}

function isProgress(start, end){
    var ret = false;
    var now = Date.now();

    if (start <= now && now <= end) {
        ret = true;
    }

    return ret;
}

function format_schedule(events){

    var mark = "";
    var msg = "登録されていません。";

    for( var i = 0 ; i < events.length ; i++){
        
        mark = " ";
        if (i == 0) {
            msg = "";
        }
        
        if (events[i].isAllDay == false) {
            var st = events[i].start;
            var et = events[i].end;
            st = !st ? "" : new Date(st.dateTime);
            et = !et ? "" : new Date(et.dateTime);
            if(st != "" && et != "" && isProgress(st, et)) {
                mark = "*"
            }
            msg += get_time(st) + "-" + get_time(et) + " " + mark;
        }

        msg += events[i].subject + "\n"
    }

    return msg;

}

function post_chatwork_(who, schedules, obj, org_msg){
    
    var msg1 = who + " さんの予定は、\n";
    var msg2 = format_schedule(schedules);
    obj.Post(org_msg, msg1 + msg2);
    
    return new Promise((resolve, reject) => {
        resolve();
    });
}


function get_zoommeetings(zoom_user_id){

    return new Promise((resolve, reject) => {
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

function format_mtg_z(mtg)
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
            now += "現在、"+ who +" で以下のMTGが開催されています。\n";
            now += format_mtg_z(mtg);
            now += "\n";
        } else {
            if(next == ""){
                next = "今後、以下のMTGが予定されています。\n";
            }
            next += format_mtg_z(mtg);
        }
    }
    if (now == ""){
        now = "現在、"+ who +" で、開催中のMTGはありません。\n\n";
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
        ret.msgcore = "Zoom" + tmp.substring(tmp.indexOf(CHATPOST_ZOOM_FORMAT)+CHATPOST_ZOOM_FORMAT.length);
    }

    return ret;
}



module.exports = function (context, req) {

    context.log('HTTP trigger function processed a request.');

    var DEBUG = process.env.MY_DEBUG;
    if (DEBUG == "true") {
        var fs = require('fs');
        var dmp = moment().tz('Asia/Tokyo').format('YYYYMMDDHHmmss') + ".json";
        fs.writeFile("./" + dmp, JSON.stringify(req), function(err){
            if (err) {
                context.log(err);
            }
        });
    }

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
                var singleuser = false;
                var fullname = who;
                var target = "";
                var phonebook = [];

                sql.query_phonebook({"who":who, "what":"phone"})
                .then((results) => {
                    if (results.length == 1) {
                        singleuser = true;
                        target = results[0].email.value;
                        fullname = results[0].name.value
                    }
                    phonebook = results;
                })
                .then(() => post_chatwork(phonebook, obj, msg))
                .then(() => {
                    if (singleuser) {
                        obj.is_internal_user(cdb, msg.from_id)
                        .then((internal) => {
                            if (internal) {
                                get_garoon_schedules(target)
                                .then((schedule) => post_chatwork_(fullname, schedule, obj, msg))
                                .catch((err) => post_chatwork_(fullname, [], obj, msg));    
                            }
                        })
                        .catch(function(err){
                            send_sorry(err, obj, msg);
                        });
                    }
                })
                .catch(function(err){
                    send_sorry(err, obj, msg);
                });

                break;
            case PURPOSE_ZOOM:
                //「zoomNN」のNN部分
                
                who = type.msgcore;
                var email = "motex_" + who + "@motex.co.jp";

                obj.is_internal_user(cdb, msg.from_id)
                .then((internal) => {
                    if (internal) {
                        sql.query_zoomusers(email)
                        .then((results) => get_zoommeetings(results[0].id.value.trim()))
                        .then((results) => post_chatwork3(results, who, obj, msg))
                        .then(() => get_garoon_schedules(email))
                        .then((results) => post_chatwork_(who, results, obj, msg))
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
                
                rp(options)
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

