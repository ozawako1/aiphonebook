
var DBConnection = require('tedious').Connection;
var DBRequest = require('tedious').Request;  
var TYPES = require('tedious').TYPES;
var Promise = require('promise');

const URL_AZURE_SQLDB = "mydomesticdatabase.database.windows.net";

var my_config = {
    "userName": process.env.MY_AZURE_SQLDB_USERNAME,
    "password": process.env.MY_AZURE_SQLDB_PASSWORD,
    "server": URL_AZURE_SQLDB,
    "options":{
        "encrypt": true,
        "database": process.env.MY_AZURE_SQLDB_DATABASE
    }
};

function db_conn(){

    console.log("Connecting...");

    return new Promise((resolve, reject) => {
        //CreateConnection
        var conn = new DBConnection(my_config);
        conn.on('connect', function(err) {  
            if(err){
                reject(err);
            } else {  
                // If no error, then good to proceed.
                console.log("Connected");
                resolve(conn);
            }
        });
    });
}

function db_execquery(conn, who){ 

    console.log("db_execquery");

    var query = "select c.name, c.mobilePhone, c.extensionNumber, g.email " +
    "FROM dbo.USERS_CYBOZU as c, dbo.USERS_GAROON as g " +
    "WHERE c.code = g.login_name AND " +
        "(c.surName = @who_surname OR " +
        "c.surNameReading = @who_surname_read OR " +
        "c.givenName = @who_givename OR " +
        "c.givenNameReading = @who_givename_read)";

    var results = [];

    return new Promise((resolve, reject) => {

        queryrequest = new DBRequest(query, function(err, rowCount){
            if (err) {
                reject(err);
            } else {
                console.log(rowCount + " row(s) found.");
            }
        });  

        queryrequest.addParameter('who_surname', TYPES.NVarChar, who);
        queryrequest.addParameter('who_surname_read', TYPES.NVarChar, who);
        queryrequest.addParameter('who_givename', TYPES.NVarChar, who);
        queryrequest.addParameter('who_givename_read', TYPES.NVarChar, who);

        queryrequest.on('row', function(columns) {  
            var obj = {};
            columns.forEach(function(col){
                var nam = col.metadata.colName;
                var val = col.value.trim();
                obj[nam] = val;
            });
            results.push(obj);
        });
        
        queryrequest.on('requestCompleted', function(){
            console.log('reqCompleted');
            conn.close();
            resolve(results);
        });

        conn.execSql(queryrequest);
    });
}

function db_execquery_(conn, query, params){ 

    var results = [];

    return new Promise((resolve, reject) => {

        queryrequest = new DBRequest(query, function(err, rowCount){
            if (err) {
                reject(err);
            } else {
                console.log(rowCount + " row(s) found.");
            }
        });  

        params.forEach((p) => {
            queryrequest.addParameter(p.name, p.type, p.value);
        });

        queryrequest.on('row', function(columns) {  
            var obj = {};
            columns.forEach(function(col){
                var nam = col.metadata.colName;
                var val = col.value.trim();
                obj[nam] = val;
            });
            results.push(obj);
        });

        queryrequest.on('requestCompleted', function(){
            console.log('reqCompleted');
            conn.close();
            resolve(results);
        });

        conn.execSql(queryrequest);
    });
}

exports.query_phonebook = function(whowhat){

    console.log("query phonebook");
  
    var who = whowhat.who;
    
    return db_conn()
        .then(conn => db_execquery(conn, who));
      
};

exports.query_zoomusers = function(email) {
    console.log("query zoomusers");

    var query = "select z.id FROM dbo.USERS_ZOOM as z WHERE z.email = @who_email";
    var params = [
        {
            name: 'who_email',
            type: TYPES.Char, 
            value: email
        }
    ];

    return db_conn()
        .then(conn => db_execquery_(conn, query, params));
};

exports.query_USERS_CHATWORK = function(chatworkid){
    console.log("query USERS_CHATWORK");

    var query = "SELECT c.account_email FROM dbo.USERS_CHATWORK as c WHERE c.account_id = @accountid";
    var params = [
        {
            name: 'accountid',
            type: TYPES.Char,
            value: chatworkid
        }
    ];
    
    return db_conn()
        .then(conn => db_execquery_(conn, query, params));

};