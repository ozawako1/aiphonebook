/*
// METHOD: GET
// QEURYSTRIG:
// mid: Garoon Meeting Id
// 
// RESPONSE:
// StatusCode: 302
// Location: URL to Start Meeting
*/

module.exports = async function (context, req) {
    context.log('StartZoomMeeting HTTP trigger function processed a request.');

    const meeting_id = req.query.mid;

    if (meeting_id == undefined || meeting_id == "") {
        context.res = {
            status: 400,
            body: "missing meeting id"
        }
        context.done();
    }


}