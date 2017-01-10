var os = require('os');
var Botkit = require('botkit');
var cache = require('memory-cache');
var moment = require('moment');

if (!process.env.clientId || !process.env.clientSecret || !process.env.PORT) {
  console.log('Error: Specify clientId clientSecret and port in environment');
  process.exit(1);
}

var controller = Botkit.slackbot({
  json_file_store: './db_slackbutton_bot/',
  port: '443',
  debug: true,
  interactive_replies: true
}).configureSlackApp(
  {
    clientId: process.env.clientId,
    clientSecret: process.env.clientSecret,
    redirectUri: process.env.redirectUri, // optional parameter passed to slackbutton oauth flow
    scopes: ['bot'],
  }
);

controller.setupWebserver(process.env.PORT,function(err,webserver) {
  controller.createWebhookEndpoints(controller.webserver);

  controller.createOauthEndpoints(controller.webserver,function(err,req,res) {
    if (err) {
      res.status(500).send('ERROR: ' + err);
    } else {
      res.send('Success!');
    }
  });
});

// just a simple way to make sure we don't
// connect to the RTM twice for the same team
var _bots = {};
function trackBot(bot) {
  _bots[bot.config.token] = bot;
}

controller.on('create_bot',function(bot,config) {

  if (_bots[bot.config.token]) {
    // already online! do nothing.
  } else {
    bot.startRTM(function(err) {

      if (!err) {
        trackBot(bot);
      }

      bot.startPrivateConversation({user: config.createdBy},function(err,convo) {
        if (err) {
          console.log(err);
        } else {
          convo.say('I am a bot that has just joined your team');
        }
      });

    });
  }

});

// Handle events related to the websocket connection to Slack
controller.on('rtm_open',function(bot) {
  console.log('** The RTM api just connected!');
});

controller.on('rtm_close',function(bot) {
  console.log('** The RTM api just closed');
  // you may want to attempt to re-open
});

controller.hears(['hi', 'hello'], 'direct_message,direct_mention,mention', function(bot, message) {
      
  bot.startConversation(message, function(err, convo) {
      if (!err) {
          convo.say('Hi, let\'s get started!');
          
          //Step 1
          convo.ask({
            "text": "What kind of file is it?",
            "attachments": [
                {
                    "text": "Choose a type",
                    "color": "#3AA3E3",
                    "attachment_type": "default",
                    "callback_id": "step_1",
                    "actions": [
                        {
                            "name": "template",
                            "text": "Template",
                            "type": "button",
                            "value": "TMP"
                        },
                        {
                            "name": "record",
                            "text": "Record",
                            "type": "button",
                            "value": "RCD"
                        }
                    ]
                },
                {
                    "title": "Need more help to answer this?",
                    "text": "Here is a brief overview of the two...need even more help? Go here."
                }
            ]
        }, function(response, convo) {
            cache.put('kind', response.text);
            convo.next();
        });
          
        //Step 2
        convo.ask({
            "text": "What groupt are you in?",
            "attachments": [
                {
                    "text": "Choose your group",
                    "color": "#3AA3E3",
                    "attachment_type": "default",
                    "callback_id": "step_2",
                    "actions": [
                        {
                            "name": "cert",
                            "text": "Cert",
                            "type": "button",
                            "value": "CERT"
                        },
                        {
                            "name": "bd",
                            "text": "BD",
                            "type": "button",
                            "value": "BD"
                        },
                        {
                            "name": "sc",
                            "text": "Supply Chain",
                            "type": "button",
                            "value": "SC"
                        },
                        {
                            "name": "tech",
                            "text": "Tech",
                            "type": "button",
                            "value": "TECH"
                        }
                    ]
                }
            ]
        }, function(response, convo) {
            cache.put('group', response.text);
            convo.next();
        });
        
        //Step 3
        //convo.ask({"text": "Does this file relate to a Salesforce record? If so, please enter the record #."}, function(response, convo) {
        //    cache.put('sfid', response.text);
        //    convo.next();
        //});
        
        //Step 4
        convo.ask({"text": "Enter a descriptive file name"}, function(response, convo) {
            var filename = camelizeUpper(response.text);
            cache.put('filename', filename);
            convo.next();
        });
      
        convo.on('end', function(convo) {
            if (convo.status == 'completed') {
                bot.reply(message, 
                    {
                    "text": "Done! Your proposed file name is:",
                    "mrkdwn": true,
                    "attachments": [
                        {
                            "title": "",
                            "color": "#3EB890",
                            "text": "*" + cache.get('kind') + '_' + cache.get('group') + '_' + cache.get('filename') + '_' + moment().format('YYYYMMDD') + "*",
                            "mrkdwn_in": [
                                "text",
                                "pretext"
                            ]
                        },
                        {
                            "text": "Look good?",
                            "callback_id": "final_step",
                            "color": "#3AA3E3",
                            "attachment_type": "default",
                            "actions": [
                                {
                                    "name": "tech",
                                    "text": "Yep, I'm done",
                                    "type": "button",
                                    "value": "tech",
                                    "style": "primary"
                                },
                                {
                                    "name": "bd",
                                    "text": "Nope, start over",
                                    "type": "button",
                                    "value": "bd"
                                }
                            ]
                        }
                    ]
                }
                );
            } else {
                // this happens if the conversation ended prematurely for some reason
                bot.reply(message, 'OK, nevermind!');
            }
        });
        
      }
  });
        
});



controller.storage.teams.all(function(err,teams) {

  if (err) {
    throw new Error(err);
  }

  // connect all teams with bots up to slack!
  for (var t  in teams) {
    if (teams[t].bot) {
      controller.spawn(teams[t]).startRTM(function(err, bot) {
        if (err) {
          console.log('Error connecting bot to Slack:',err);
        } else {
          trackBot(bot);
        }
      });
    }
  }

});

function camelizeLower(str) {
  return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function(match, index) {
    if (+match === 0) return ""; // or if (/\s+/.test(match)) for white spaces
    return index == 0 ? match.toLowerCase() : match.toUpperCase();
  });
}

function camelizeUpper(str) {  
  return str.replace(/\W+(.)/g, function(match, chr){  
      return chr.toUpperCase();  
    });  
}  
