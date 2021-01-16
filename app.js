#!/usr/bin/env node
'use strict';

const etherpad = require("etherpad-cli-client"),
      Measured = require("measured"),
         async = require("async"),
          argv = require("argv"),
      argvopts = require("./argopts.js").opts,
       request = require('request');

const stats = Measured.createCollection();
const startTimestamp = Date.now();
const activeConnections = new Measured.Counter();

let endTime;
let host = 'http://127.0.0.1:9001';
let initialMemory;
let finalMemory;

// Take Params and process them
var args = argv.option( argvopts ).run();

// Check for a host..
if(process.argv[2] && process.argv[2].indexOf("http") !== -1){
  host = process.argv[2];
}

if(args.options.duration){
  endTime = startTimestamp + (args.options.duration*1000);
} else {
  endTime = startTimestamp + 600000;
}

request(`${host}/stats/`, function (error, response, body) {
  if(error) throw new Error('Unable to connect to Etherpad');
  initialMemory = JSON.parse(body).memoryUsageHeap;
})

let ending = false;
// Check every second to see if currentTime is => endTime
setInterval(function(){
  const currentTime = Date.now();
  if(currentTime > endTime){
    if (!ending) {
      console.log("Test duration complete");
      console.log(`Opening ${stats.toJSON().acceptedCommit.count} pads consumed ${(finalMemory - initialMemory) /(1024*1024)} Mb memory`);
      console.log("Waiting 10 minutes to see memory begins to free up");
      setTimeout(function(){
        request(`${host}/stats/`, function (error, response, body) {
          const afterTimeMemory = JSON.parse(body).memoryUsageHeap;
          if(afterTimeMemory <= initialMemory) {
            console.log("Memory was released, no leak present.");
            process.exit(0);
          } else {
            console.log(`Memory was not released.  Leak present.  ${(afterTimeMemory - initialMemory) /(1024*1024)} Mb memory was horded`);
            process.exit(1);
          }
        })
      }, 600000);
    }
    ending = true;

  } else {
    newPad();
    if (stats.toJSON().acceptedCommit) {
      request(`${host}/stats/`, function (error, response, body) {
        const memory = JSON.parse(body).memoryUsageHeap;
        finalMemory = memory;
        console.log(`Pad Count: ${stats.toJSON().acceptedCommit.count} --- Memory Usage: ${memory / (1024*1024)} Mb`);
      })
    }
  }
},1000);

// Creates a new author
const newPad = () => {
  const testUrl = host+"/p/memory_leak_test_"+randomPadName();
  var pad = etherpad.connect(testUrl);
  pad.on("socket_timeout", function(){
    console.error("socket timeout connecting to pad");
    process.exit(1);
  })
  pad.on("socket_error", function(){
    console.error("connection error connecting to pad, did you remember to set loadTest to true?");
    process.exit(1);
  })
  pad.on("connected", function(padState){
    try{
      pad.append(randomString()); // Appends 4 Chars
    }
    catch(e){
      stats.meter('error').mark();
      console.error("Error!");
    }
  });
  pad.on("message", function(msg){
    if(msg.type !== "COLLABROOM") return;
    if(msg.data.type === "ACCEPT_COMMIT"){
      stats.meter('acceptedCommit').mark();
    }
  });
}

function randomString() {
  let randomstring = '';
  var string_length = 4; // See above for WPM stats
  for (var i=0; i<string_length; i++) {
    var charNumber = Math.random() * (300 - 1) + 1;
    var str = String.fromCharCode(parseInt(charNumber));
    // This method generates sufficient noise
    // It also includes white space and non ASCII Chars
    randomstring += str;
  }
  return randomstring;
}

function randomPadName(){ // From index.html
  var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  var string_length = 10;
  var randomstring = '';
  for (var i = 0; i < string_length; i++){
    var rnum = Math.floor(Math.random() * chars.length);
    randomstring += chars.substring(rnum, rnum + 1);
  }
  return randomstring;
}
