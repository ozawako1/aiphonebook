
var http_req = require("request");
//const TO_REG = /\[To:[0-9]*\].*\n/;


class CChatworkMessage {
    constructor (postdata) {
        this.from_id = postdata.webhook_event.account_id;
        if (this.from_id == undefined) {
            this.from_id = postdata.webhook_event.from_account_id;
        }
        this.room_id = postdata.webhook_event.room_id;
        this.message_id = postdata.webhook_event.message_id;
        this.body = postdata.webhook_event.body;
        this.debug = postdata.debug;
    }
}

class CWebServiceChatwork {
    constructor () {
        this.httpclient = http_req;
        this.token = process.env.MY_CHATWORK_JOSYSBOT_TOKEN;
    }

    Reply(org_msg, msg_body) {

        var retrun_url = "https://api.chatwork.com/v2/rooms/" + org_msg.room_id + "/messages";

        var reply = {
            headers: {
                'X-ChatWorkToken': this.token
            },
            form: {
                body: this.format_reply_msg(org_msg, msg_body)
            } 
        };
        
        this.httpclient.post(retrun_url, reply, function (err, res, body) { 
            if (!err && res.statusCode == 200) {
                console.log("OK." + body);
            } else {
                console.log("NG." + body);
            }   
        });

    }

    Post(org_msg, msg_body) {

        var retrun_url = "https://api.chatwork.com/v2/rooms/" + org_msg.room_id + "/messages";

        var reply = {
            headers: {
                'X-ChatWorkToken': this.token
            },
            form: {
                body: msg_body
            } 
        };
        
        this.httpclient.post(retrun_url, reply, function (err, res, body) { 
            if (!err && res.statusCode == 200) {
                console.log("OK." + body);
            } else {
                console.log("NG." + body);
            }   
        });

    }

    format_reply_msg(org_msg, msg) {
       
        var body = msg;
        if (msg === "") {
            body = "Not found.";
        }
        return "[rp aid=" + org_msg.from_id + " to=" + org_msg.room_id + "-" + org_msg.message_id +"]" + "\r\n" + body;
    }


    is_internal_user(cdb, chatworkid){
    
        return new Promise((resolve, reject) => {
            var ret = false;
            cdb.query_chatworkmaster(chatworkid)
            .then((email) => {
                if (email[0].account_email.indexOf('@motex.co.jp') != -1) {
                    ret = true;
                }
                resolve(ret);
            })
            .catch((error) => reject(err));
        });
    }

}

module.exports.CChatworkMessage = CChatworkMessage
module.exports.CWebServiceChatwork = CWebServiceChatwork

