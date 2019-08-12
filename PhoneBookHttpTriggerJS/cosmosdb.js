
var my_cosmosdb = {
    "endpoint": "https://yellowpage.documents.azure.com:443/",
    "primaryKey": process.env.MY_COSMOSDB_TOKEN,
    "databaseid": process.env.MY_COSMOSDB_ID,
    "collectionid": process.env.MY_COSMOSDB_COLLECTION 
};

var documentClient = require("documentdb").DocumentClient;
var client = new documentClient(my_cosmosdb.endpoint, { "masterKey": my_cosmosdb.primaryKey });
var databaseUrl = `dbs/${my_cosmosdb.databaseid}`;
var collectionUrl = `${databaseUrl}/colls/${my_cosmosdb.collectionid}`;



/**
 * Get the collection by ID, or create if it doesn't exist.
 */
function getCollection() {
    console.log(`Getting collection:\n${my_cosmosdb.collectionid}\n`);

    return new Promise((resolve, reject) => {
        client.readCollection(collectionUrl, (err, result) => {
            if (err) {
                reject(new Error("g"));
            } else {
                resolve(result);
            }
        });
    });
}


/**
 * Query the collection using SQL
 */
function queryCollection(chatworkid) {
    console.log(`Querying collection :\n${my_cosmosdb.collectionid}`);

    var querystring = "select r.account_email " +
        "FROM root as r " +
        "WHERE r.account_id = @who_chatworkid";

    var queryspec = {
        query: querystring,
        parameters: [{ name: '@who_chatworkid', value: "" + chatworkid }]
    };


    return new Promise((resolve, reject) => {

        var queryiterator = client.queryDocuments(collectionUrl,queryspec);
        var found = queryiterator.hasMoreResults();

        if (found == false) {
            // チャット投稿者自身のメールアドレスがないことは考えにくい
            reject(new Error("Not found"));
        }
        
        queryiterator.toArray((err, results) => {
            //ここでresultsのlengthを見るのは？だが、挙動から入れておく。
            if (err) {
                reject(err);
            } else if(results.length == 0) {
                reject(new Error("Not Found."));
            } else {
                for (var i = 0 ; i < results.length ; i++) {
                    let resultString = JSON.stringify(results[i]);
                    console.log(`\tQuery returned ${resultString}`);
                }
                resolve(results);
            }
        });
    });
}

exports.query_chatworkmaster = function(chatworkid) {
    return new Promise((resolve, reject) => {
        getCollection()
            .then(() => queryCollection(chatworkid))
            .then((results) => resolve(results))
            .catch((error) => reject(error));
        });
};
