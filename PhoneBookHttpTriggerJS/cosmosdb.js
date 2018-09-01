
/**
 * Get the collection by ID, or create if it doesn't exist.
 */
function getCollection() {
    console.log(`Getting collection:\n${config.cosmosdb.collectionid}\n`);

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
function queryCollection(who) {
    console.log(`Querying collection :\n${config.cosmosdb.collectionid}`);

    var querystring = "select r.name, r.mobilePhone, r.extensionNumber " +
        "FROM root as r " +
        "WHERE r.surName = @who_surname OR " +
            "r.surNameReading = @who_surname_read OR " +
            "r.givenName = @who_givename OR " +
            "r.givenNameReading = @who_givename_read";

    var queryspec = {
        query: querystring,
        parameters: [   { name: '@who_surname', value: who },
                        { name: '@who_surname_read', value: who },
                        { name: '@who_givename', value: who },
                        { name: '@who_givename_read', value: who }]
    };


    return new Promise((resolve, reject) => {

        var queryiterator = client.queryDocuments(collectionUrl,queryspec);
        var found = queryiterator.hasMoreResults();

        if (found == false) {
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
};

function query_phonebook(whowhat) 
{
    return new Promise((resolve, reject) => {
        getCollection()
            .then(() => queryCollection(whowhat.who))
            .then((results) => resolve(results))
            .catch((error) => reject(error));
        });
}