"use strict";

var moment = require('moment');
var fs = require('fs');
var azureStorage = require('azure-storage');
var blobService = azureStorage.createBlobService();
var AWS = require('aws-sdk'); 
var uuid = require('node-uuid');
//var pid = uuid.v4();
var os = require('os');
var pid = os.hostname() + '#' + process.argv[2];
var path = require('path');

AWS.config.loadFromPath(path.resolve(__dirname, 'config.json'));
var s3 = new AWS.S3(); 
var sourceBucketName = 's3stress-source';
var sourceKeyName = 'OneKBFile.txt';
var localFileName = 'downloaded' + '_' + pid +'.dat';

var dataProcessed = 0;
var transactionsProcessed = 0;
var errorEvents = 0;
var previousTime;
var operationLatency = 0;

var database;
var collection;
var DocumentClient = require('documentdb').DocumentClient;
var docDBClient = new DocumentClient('https://amitkulwasstress.documents.azure.com:443/', {masterKey:process.env.AZURE_DOCDB_AUTH_KEY});

setupDocumentDB('wasstress', 'wasstressresults', function(){  
  var localFileStream = fs.createWriteStream(localFileName);
  var getParams = {Bucket: sourceBucketName, Key: sourceKeyName};
  var readstream = s3.getObject(getParams).createReadStream();
  readstream.pipe(localFileStream);
  readstream.on('end',function(){
    console.log(pid + ' ' + 'successfully downloaded payload file');
    setupUploadLoop();    
  });
});


function setupUploadLoop(){
  fs.readFile(localFileName, function(err, data){
    if (err) { throw err; }    
    else{
      previousTime = new Date();
      setInterval(throughputCalculator, 60000);
      writeToAzure(data);
    }
  });  
}

function writeToAzure(payload){
  var containerName = 'wasstress';
  var bucketName = 's3stress';  
  //var folderPrefix = 'rawevents/someevent/2015/04/26/' + pid + '/';
  var folderPrefix = '';
  var keyPrefix = String('000000000' + getRandomInt(1, 1000000000)).slice(-9);
  var keyName = folderPrefix + keyPrefix + '_' + pid + '_' + sourceKeyName;

  var begintime = moment();
  blobService.createBlockBlobFromText(containerName, keyName, payload, function(error, result, response){
    var endtime = moment();
    if(error){      
      console.log(pid + ' Error in createBlockBlobFromText');
      console.log(error);
      ++errorEvents;
    }
    else{
      var currentOperationLatency = endtime.diff(begintime);
      operationLatency = ((operationLatency * transactionsProcessed) + currentOperationLatency) / (transactionsProcessed + 1);
      ++transactionsProcessed;
      dataProcessed += payload.length;      
    }

    // Recurse in all cases (error or not)
    setTimeout(function(){
      writeToAzure(payload);  
    }, 0);

  });
}

function throughputCalculator(){
  var timeInterval = new Date() - previousTime;
  var dataThroughput = dataProcessed * 1000/ timeInterval;
  var transactionThroughput = transactionsProcessed  * 1000/ timeInterval;
  var errorRate = 0;
  if((transactionsProcessed + errorEvents) != 0) {
    errorRate = errorEvents / (transactionsProcessed + errorEvents) * 100;
  }
  console.log('Pid: %s, Data Processed: %d, Transactions Processed: %d, Time Interval: %d, Errors: %d, Data Throughput: %d, Transaction Throughput: %d, Error Rate: %d\%, Operation Latency: %d',
               pid,
               dataProcessed, 
               transactionsProcessed,
               timeInterval, 
               errorEvents,
               dataThroughput, 
               transactionThroughput,
               errorRate,
               operationLatency);

  var item = {
    Pid: pid,
    Timestamp: moment().format('x'),
    DataThroughput: dataThroughput.toString(),
    TransactionThroughput: transactionThroughput.toString(),
    ErrorRate: errorRate.toString(),
    Errors: errorEvents.toString(),      
    Interval: timeInterval.toString(),
    OperationLatency: operationLatency.toString()
  };

  docDBClient.createDocument(collection._self, item, function(err, doc){
    if (err) {
      console.log(pid + ' Error in createDocument');
      console.log(err); // an error occurred
    }    
  });

  dataProcessed = 0;
  transactionsProcessed = 0;
  errorEvents = 0;
  previousTime = new Date();
}

function getRandomInt (low, high) {
    return Math.floor(Math.random() * (high - low) + low);
}

function setupDocumentDB(databaseid, collectionid, callback){
  var querySpec;
  querySpec = {
              query: 'SELECT * FROM root r WHERE r.id=@id',
              parameters: [{
                  name: '@id',
                  value: databaseid
              }]
          };

  var attempt = require('attempt');
  attempt(
    { retries: 5, interval: 1000 },
    function(attempts) {    
        if(attempts)
          console.log('This is retry #%d to connect to documentdb',attempts);
        docDBClient.queryDatabases(querySpec).toArray(this);
    },
    function(err, results) {
      if (err){
        console.log(pid + ' Error in queryDatabases');
        console.log(err);        
        throw err;    
      }
      else{
        console.log(pid + ' ' +'successfully got documentdb');
        database = results[0];

        querySpec = {
                    query: 'SELECT * FROM root r WHERE r.id=@id',
                    parameters: [{
                        name: '@id',
                        value: collectionid
                    }]
                };

        attempt(
          { retries: 5, interval: 1000 },
          function(attempts) {    
              if(attempts)
                console.log('This is retry #%d to connect to get documentdb collection', attempts);              
              docDBClient.queryCollections(database._self, querySpec).toArray(this);
          },
          function(err, results){
            if (err){
              console.log(pid + ' Error in queryCollections');
              console.log(err);
              throw err;    
            }
            else{
              console.log(pid + ' ' +'successfully got document collection');
              collection = results[0];
              callback();
            }
          });        
      }
    }
  )};