
var DBConnection = require('tedious').Connection;
var DBRequest = require('tedious').Request;  
var TYPES = require('tedious').TYPES;
var Promise = require('promise');

const URL_AZURE_SQLDB = "lspgatewaysql.database.windows.net";

var my_config = {
    "userName": process.env.MY_AZURE_SQLDB_USERNAME,
    "password": process.env.MY_AZURE_SQLDB_PASSWORD,
    "server": URL_AZURE_SQLDB,
    "options":{
        "useColumnNames": true,
        "rowCollectionOnRequestCompletion": true,
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

    var query = "select c.name, c.mobilePhone, c.extensionNumber, g.userId " +
    "FROM dbo.USERS_CYBOZU as c, dbo.USERS_GAROON as g " +
    "WHERE c.code = g.login_name AND " +
        "(c.surName = @who_surname OR " +
        "c.surNameReading = @who_surname_read OR " +
        "c.givenName = @who_givename OR " +
        "c.givenNameReading = @who_givename_read)";

    var results = [];

    return new Promise((resolve, reject) => {

        queryrequest = new DBRequest(query, function(err, rowCount, rows){
            if (err) {
                reject(err);
            } else if (rowCount == 0){
                reject(new Error("not Found."))
            } else {
                console.log(rowCount + " row(s) found.");
                rows.forEach(function(row){
                    results.push(row);
                });
            }
        });  

        queryrequest.addParameter('who_surname', TYPES.NVarChar, who);
        queryrequest.addParameter('who_surname_read', TYPES.NVarChar, who);
        queryrequest.addParameter('who_givename', TYPES.NVarChar, who);
        queryrequest.addParameter('who_givename_read', TYPES.NVarChar, who);

/*
        queryrequest.on('row', function(columns) {  
            columns.forEach( function(column) {
                var val = '';
                if (column.value != null) {
                    val = column.value;
                }          
            });
        });
*/
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