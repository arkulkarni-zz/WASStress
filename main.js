"use strict";

var moment = require('moment');
var fs = require('fs');
var azureStorage = require('azure-storage');
var blobService = azureStorage.createBlobService();
var AWS = require('aws-sdk'); 
var uuid = require('node-uuid');
var pid = uuid.v4();
var path = require('path');

AWS.config.loadFromPath(path.resolve(__dirname, 'config.json'));
var s3 = new AWS.S3(); 
var db = new AWS.DynamoDB();

var dataProcessed = 0;
var transactionsProcessed = 0;
var errorEvents = 0;

var previousTime = new Date();
setInterval(throughputCalculator, 60000);

var sourceBucketName = 's3stress-source';
var sourceKeyName = 'FourMegFile.txt';
var localFileName = 'downloaded' + '_' + pid +'.dat';

var getParams = {Bucket: sourceBucketName, Key: sourceKeyName};

var localFileStream = fs.createWriteStream(localFileName);
var readstream = s3.getObject(getParams).createReadStream();
readstream.pipe(localFileStream);
readstream.on('end',function(){
  setupUploadLoop();
  
});

function setupUploadLoop(){
  fs.readFile(localFileName, function(err, data){
    if (err) { throw err; }    
    else
      writeToAzure(data);
  });  
}

function writeToAzure(payload){
  var containerName = 'wasstress';
  var bucketName = 's3stress';  
  //var folderPrefix = 'rawevents/someevent/2015/04/26/' + pid + '/';
  var folderPrefix = '';
  var keyPrefix = String('000000000' + getRandomInt(1, 1000000000)).slice(-9);
  var keyName = folderPrefix + keyPrefix + '_' + pid + '_' + sourceKeyName;

  blobService.createBlockBlobFromText(containerName, keyName, payload, function(error, result, response){
    if(error){
      console.log(err);
      ++errorEvents;
    }
    else{
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
  console.log('Pid: %s, Data Processed: %d, Transactions Processed: %d, Time Interval: %d, Errors: %d, Data Throughput: %d, Transaction Throughput: %d, Error Rate: %d\%',
               pid,
               dataProcessed, 
               transactionsProcessed,
               timeInterval, 
               errorEvents,
               dataThroughput, 
               transactionThroughput,
               errorRate);

  var putparams = {
    Item: {
      Pid: {'S': pid},
      Timestamp: {'N': moment().format('x')},
      DataThroughput: {'N': dataThroughput.toString()},
      TransactionThroughput: {'N': transactionThroughput.toString()},
      ErrorRate: {'N': errorRate.toString()},
      Errors: {'N': errorEvents.toString()},      
      Interval: {'N': timeInterval.toString()}
    },
    TableName: 'S3StressResults'
  };

  db.putItem(putparams, function(err, data){
    if (err) {
      console.log(err, err.stack); // an error occurred
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