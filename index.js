'use strict';


var libQ = require('kew');
var fs = require('fs-extra');
var config = require('v-conf');
var unirest = require('unirest');
var crypto = require('crypto');
var htmlToJson = require('html-to-json');
var RssParser = require('rss-parser');

module.exports = ControllerPodcast;

function ControllerPodcast(context) {
	var self = this;

  self.context = context;
  self.commandRouter = this.context.coreCommand;
  self.logger = this.context.logger;
  self.configManager = this.context.configManager;
  self.state = {};
  self.stateMachine = self.commandRouter.stateMachine;

  self.logger.info("ControllerPodcast::constructor");
}

ControllerPodcast.prototype.onVolumioStart = function()
{
  var self = this;

  self.configFile=this.commandRouter.pluginManager.getConfigurationFile(this.context,'config.json');
  self.getConf(self.configFile);

  return libQ.resolve();
};

ControllerPodcast.prototype.getConfigurationFiles = function () {
  return ['config.json'];
};

ControllerPodcast.prototype.onStart = function() {
  var self = this;

  self.mpdPlugin = this.commandRouter.pluginManager.getPlugin('music_service','mpd');

  self.loadRadioI18nStrings();
  self.addPodcastsResource();
  self.addToBrowseSources();

  self.serviceName = "personal_radio";

  return libQ.resolve();
};

ControllerPodcast.prototype.onStop = function() {
  var self = this;

  return libQ.resolve();
};

ControllerPodcast.prototype.onRestart = function() {
  var self = this;

  return libQ.resolve();
};


// Configuration Methods -----------------------------------------------------
ControllerPodcast.prototype.getConf = function(configFile) {
  var self = this;

  self.config = new (require('v-conf'))();
  self.config.loadFile(configFile);
};

ControllerPodcast.prototype.setConf = function(conf) {
  var self = this;

  fs.writeJsonSync(self.configFile, JSON.stringify(conf));
};

ControllerPodcast.prototype.getUIConfig = function() {
  var self = this;
  var defer = libQ.defer();
  var lang_code = this.commandRouter.sharedVars.get('language_code');

  self.getConf(this.configFile);
  self.commandRouter.i18nJson(__dirname+'/i18n/strings_' + lang_code + '.json',
      __dirname + '/i18n/strings_en.json',
      __dirname + '/UIConfig.json')
  .then(function(uiconf)
  {
    uiconf.sections[0].content[0].value = self.config.get('sbsProtocol');
    uiconf.sections[0].content[1].value = self.config.get('mbcProtocol');

    defer.resolve(uiconf);
  })
  .fail(function()
  {
    defer.reject(new Error());
  });

  return defer.promise;
};

ControllerPodcast.prototype.setUIConfig = function(data)
{
  var self = this;

  var uiconf=fs.readJsonSync(__dirname+'/UIConfig.json');

  return libQ.resolve();
};

ControllerPodcast.prototype.updateConfig = function (data) {
  var self = this;
  var defer = libQ.defer();
  var configUpdated = false;

  if (self.config.get('sbsProtocol') != data['sbsProtocol']) {
    self.config.set('sbsProtocol', data['sbsProtocol']);
    self.sbsProtocol = data['sbsProtocol'];
    configUpdated = true;
  }

  if (self.config.get('mbcProtocol') != data['mbcProtocol']) {
    self.config.set('mbcProtocol', data['mbcProtocol']);
    self.mbcProtocol = data['mbcProtocol'];
    configUpdated = true;
  }

  if(configUpdated) {
    var responseData = {
      title: self.getRadioI18nString('PLUGIN_NAME'),
      message: self.getRadioI18nString('STOP_RADIO_STATION'),
      size: 'md',
      buttons: [{
        name: 'Close',
        class: 'btn btn-info'
      }]
    };

    self.commandRouter.broadcastMessage("openModal", responseData);
  }

  return defer.promise;
};

// Playback Controls ---------------------------------------------------------
ControllerPodcast.prototype.addToBrowseSources = function () {
  var self = this;

  self.commandRouter.volumioAddToBrowseSources({
    name: self.getRadioI18nString('PLUGIN_NAME'),
    uri: 'podcast',
    plugin_type: 'music_service',
    plugin_name: "podcast",
    albumart: '/albumart?sourceicon=music_service/podcast/podcast.svg'
  });
};

ControllerPodcast.prototype.handleBrowseUri = function (curUri) {
  var self = this;
  var defer = libQ.defer();
  var response;

  //self.logger.info("ControllerPodcast::handleBrowseUri:"+curUri);

  if (curUri.startsWith('podcast')) {
    if (curUri === 'podcast') {
      defer.resolve(self.getRootContent());
    }
    else {
      var uris = curUri.split('/');
      defer.resolve(self.getPodcastContent(uris[1]);
    }

  }

  return defer.promise;
};
;

ControllerPodcast.prototype.getPodcast = function(channel, uri) {
  var self = this;
  var defer = libQ.defer();

  self.logger.info("ControllerPodcast::podcast:post:"+ uri);
  var rssParser = new RssParser({
    customFields: {
      channel: ['image']
    }
  });

  self.commandRouter.pushToastMessage(
      'info',
      self.getRadioI18nString('PLUGIN_NAME'),
      self.getRadioI18nString('WAIT_BBC_PODCAST_ITEMS')
  );

  rssParser.parseURL(self.bbcPodcastRSS + uri + '.rss',
    function (err, feed) {

      self.bbcNavigation.navigation.prev.uri = 'kradio/bbc/' + channel;
      var response = self.bbcNavigation;
      response.navigation.lists[0].title = self.getRadioI18nString('TITLE_' + channel.toUpperCase()) + '/' + feed.title;
      response.navigation.lists[0].items = [];

      self.podcastImage = feed.itunes.image;
      //self.logger.info("ControllerPodcast::PODCAST:IMAGE:"+self.podcastImage);

      feed.items.forEach(function (entry) {
        //console.log(entry.title + ':' + entry.enclosureSecure.$.url);
        var channel = {
          service: self.serviceName,
          type: 'podcast',
          title: entry.title,
          icon: 'fa fa-music',
          uri: 'webbbc/0/' + entry.enclosureSecure.$.url
        };
        response.navigation.lists[0].items.push(channel);
      });
      //self.logger.info("ControllerPodcast::PodcastArticle:RESULT:"+ JSON.stringify(response));
      defer.resolve(response);
    });

  return defer.promise;
};

ControllerPodcast.prototype.getRootContent = function() {
  var self=this;
  var response;
  var defer = libQ.defer();

  response = self.rootNavigation;
  response.navigation.lists[0].title = self.getRadioI18nString('PLUGIN_NAME');
  response.navigation.lists[0].items = [];
  for (var key in self.rootStations) {
      var radio = {
        service: self.serviceName,
        type: 'folder',
        title: self.rootStations[key].title,
        //icon: 'fa fa-folder-open-o',
        uri: self.rootStations[key].uri,
        albumart: '/albumart?sourceicon=music_service/personal_radio/logos/'+ self.rootStations[key].albumart
      };
      response.navigation.lists[0].items.push(radio);
  }
  defer.resolve(response);
  return defer.promise;
};

ControllerPodcast.prototype.getRadioContent = function(station) {
  var self=this;
  var response;
  var radioStation;
  var defer = libQ.defer();

  switch (station) {
    case 'kbs':
      radioStation = self.radioStations.kbs;
      break;
    case 'sbs':
      radioStation = self.radioStations.sbs;
      break;
    case 'mbc':
      radioStation = self.radioStations.mbc;
      break;
    case 'linn':
      radioStation = self.radioStations.linn;
      break;
    case 'bbc':
      radioStation = self.radioStations.bbc;
  }

  response = self.radioNavigation;
  response.navigation.lists[0].title = self.getRadioI18nString('TITLE_' + station.toUpperCase());
  response.navigation.lists[0].items = [];
  for (var i in radioStation) {
    var channel = {
      service: self.serviceName,
      title: radioStation[i].title,
      uri: radioStation[i].uri
    };
    if (station === 'bbc') {
      channel["type"] = 'folder';
      //channel["icon"] = 'fa fa-folder-open-o';
      channel["albumart"] = '/albumart?sourceicon=music_service/personal_radio/logos/'+ radioStation[i].albumart
    }
    else {
      channel["type"] = 'mywebradio';
      channel["icon"] = 'fa fa-music';
    }
    response.navigation.lists[0].items.push(channel);
  }

  defer.resolve(response);

  return defer.promise;
};

ControllerPodcast.prototype.clearAddPlayTrack = function(track) {
  var self = this;
  var defer = libQ.defer();

  return self.mpdPlugin.sendMpdCommand('stop', [])
    .then(function() {
        return self.mpdPlugin.sendMpdCommand('clear', []);
    })
    .then(function() {
        return self.mpdPlugin.sendMpdCommand('add "'+track.uri+'"',[]);
    })
    .then(function () {
      self.commandRouter.pushToastMessage('info',
        self.getRadioI18nString('PLUGIN_NAME'),
        self.getRadioI18nString('WAIT_FOR_RADIO_CHANNEL'));

      return self.mpdPlugin.sendMpdCommand('play', []).then(function () {
        switch (track.radioType) {
          case 'kbs':
          case 'sbs':
          case 'mbc':
            return self.mpdPlugin.getState().then(function (state) {
                return self.commandRouter.stateMachine.syncState(state, self.serviceName);
            });
            break;
          default:
            self.commandRouter.stateMachine.setConsumeUpdateService('mpd');
            return libQ.resolve();
        }
      })
    })
    .fail(function (e) {
      return defer.reject(new Error());
    });
};

ControllerPodcast.prototype.seek = function (position) {
  var self = this;

  return self.mpdPlugin.seek(position);
};

ControllerPodcast.prototype.stop = function() {
	var self = this;
	var serviceName;

  self.commandRouter.pushToastMessage(
      'info',
      self.getRadioI18nString('PLUGIN_NAME'),
      self.getRadioI18nString('STOP_RADIO_CHANNEL')
  );

  self.logger.info("#######:STOP:CONSUME:"+self.commandRouter.stateMachine.isConsume);
  self.logger.info("#######:STOP:SERVICE:"+self.commandRouter.stateMachine.consumeState.service);
  if (self.commandRouter.stateMachine.consumeState.service === 'mpd')
    serviceName = 'mpd';
  else
    serviceName = self.serviceName;
  serviceName = self.serviceName;

  return self.mpdPlugin.stop().then(function () {
    return self.mpdPlugin.getState().then(function (state) {
      return self.commandRouter.stateMachine.syncState(state, serviceName);
    });
  });
};

ControllerPodcast.prototype.pause = function() {
  var self = this;
  var serviceName;
  
  self.commandRouter.pushToastMessage('info', 'PERSONAL', 'pause');

  self.logger.info("#######:PAUSE:CONSUME:"+self.commandRouter.stateMachine.isConsume);
  self.logger.info("#######:PAUSE:SERVICE:"+self.commandRouter.stateMachine.consumeState.service);
  if (self.commandRouter.stateMachine.consumeState.service === 'mpd')
    serviceName = 'mpd';
  else
    serviceName = self.serviceName;
  serviceName = self.serviceName;

  return self.mpdPlugin.pause().then(function () {
    return self.mpdPlugin.getState().then(function (state) {
      return self.commandRouter.stateMachine.syncState(state, serviceName);
    });
  });
};

ControllerPodcast.prototype.resume = function() {
  var self = this;
  var serviceName;

  self.commandRouter.pushToastMessage('info', 'PERSONAL', 'resume');

  self.logger.info("#######:RESUME:CONSUME:"+self.commandRouter.stateMachine.isConsume);
  self.logger.info("#######:RESUME:SERVICE:"+self.commandRouter.stateMachine.consumeState.service);
  if (self.commandRouter.stateMachine.consumeState.service === 'mpd')
    serviceName = 'mpd';
  else
    serviceName = self.serviceName;
  serviceName = self.serviceName;

  return self.mpdPlugin.resume().then(function () {
    return self.mpdPlugin.getState().then(function (state) {
      return self.commandRouter.stateMachine.syncState(state, serviceName);
    });
  });
};

ControllerPodcast.prototype.explodeUri = function (uri) {
  var self = this;
  var defer = libQ.defer();
  var uris = uri.split("/", 2);
  var channel = parseInt(uris[1]);
  var response;
  var query;
  var station;

  self.logger.info("ControllerPodcast::explodeUri:"+uri);
  station = uris[0].substring(3);
  response = {
      service: self.serviceName,
      type: 'track',
      trackType: self.getRadioI18nString('PLUGIN_NAME'),
      radioType: station,
      samplerate: '',
      bitdepth: '',
      albumart: '/albumart?sourceicon=music_service/personal_radio/logos/'+station+'.svg'
  };

  switch (uris[0]) {
    case 'webkbs':
      var userId = Math.random().toString(36).substring(2, 6) +
                   Math.random().toString(36).substring(2, 6);
      query = {
        id: userId,
        channel: channel+1
      };
      self.getStreamUrl(station, self.baseKbsStreamUrl, query)
        .then(function (responseUrl) {
          if (responseUrl  !== null) {
            var result = responseUrl.split("\n");
            var retCode = parseInt(result[0]);
            var streamUrl;
            if (retCode === 0)
              streamUrl = result[1];
            else {
              streamUrl = null;
              self.errorToast(station, 'INCORRECT_RESPONSE');
            }

            response["uri"] = streamUrl;
            response["name"] = self.radioStations.kbs[channel].title;
            response["title"] = self.radioStations.kbs[channel].title;
          }
          defer.resolve(response);
        });
      break;

    case 'websbs':
      var device;
      if(self.sbsProtocol === true)
        device = 'mobile';
      else
        device = 'pc';

      var baseSbsStreamUrl = self.baseSbsStreamUrl + self.radioStations.sbs[channel].channel;
      self.getStreamUrl(station, baseSbsStreamUrl, {device: device})
        .then(function (responseUrl) {
          if (responseUrl  !== null) {
            var decipher = crypto.createDecipheriv(self.sbsAlgorithm, self.sbsKey, "");
            var streamUrl = decipher.update(responseUrl, 'base64', 'utf8');
            streamUrl += decipher.final('utf8');

            response["uri"] = streamUrl;
            response["name"] = self.radioStations.sbs[channel].title;
            response["title"] = self.radioStations.sbs[channel].title;
          }
          defer.resolve(response);
        });
      break;

    case 'webmbc':
      var agent, protocol;
      if(self.mbcProtocol === true) {
        agent = 'android';
        protocol = 'M3U8';
      }
      else {
        agent = 'pc';
        protocol = 'RTMP';
      }

      query = {
        channel: self.radioStations.mbc[channel].channel,
        agent: agent,
        protocol: protocol
      };
      self.getStreamUrl(station, self.baseMbcStreamUrl, query)
        .then(function (responseUrl) {
          if (responseUrl  !== null) {
            var result = JSON.parse(responseUrl.replace(/\(|\)|\;/g, ''));
            var streamUrl = result.AACLiveURL;
            if (streamUrl === undefined) {
              streamUrl = null;
              self.errorToast(station, 'INCORRECT_RESPONSE');
            }

            response["uri"] = streamUrl;
            response["name"] = self.radioStations.mbc[channel].title;
            response["title"] = self.radioStations.mbc[channel].title;
          }
          defer.resolve(response);
        });
      break;

    case 'weblinn':
      response["uri"] = self.radioStations.linn[channel].url;
      response["name"] = self.radioStations.linn[channel].title;

      defer.resolve(response);
      break;

    case 'webbbc':
      response["uri"] = uri.match(/webbbc\/.\/(.*)/)[1];
      response["name"] = 'BBC podcast';
      response["albumart"] = self.podcastImage;
      defer.resolve(response);
      break;

    default:
      defer.resolve();
  }

  return defer.promise;
};

// Stream and resource functions for Radio -----------------------------------

ControllerPodcast.prototype.getSecretKey = function (radioKeyUrl) {
  var self = this;
  var defer = libQ.defer();

  var Request = unirest.get(radioKeyUrl);
  Request.end (function (response) {
    if (response.status === 200) {
      var result = JSON.parse(response.body);

      if (result !== undefined) {
        defer.resolve(result);
      } else {
        self.commandRouter.pushToastMessage('error',
            self.getRadioI18nString('PLUGIN_NAME'),
            self.getRadioI18nString('ERROR_SECRET_KEY'));

        defer.resolve(null);
      }
    } else {
      self.commandRouter.pushToastMessage('error',
          self.getRadioI18nString('PLUGIN_NAME'),
          self.getRadioI18nString('ERROR_SECRET_KEY_SERVER'));
      defer.resolve(null);
    }
  });

  return defer.promise;
};

ControllerPodcast.prototype.getStreamUrl = function (station, url, query) {
  var self = this;
  var defer = libQ.defer();

  var Request = unirest.get(url);
  Request
    .query(query)
    .end(function (response) {
      if (response.status === 200)
        defer.resolve(response.body);
      else {
        defer.resolve(null);
        self.errorToast(station, 'ERROR_STREAM_SERVER');
      }
    });

  return defer.promise;
};

ControllerPodcast.prototype.addPodcastsResource = function() {
  var self=this;

  var podcastsResource = fs.readJsonSync(__dirname+'/podcast_list.json');
  self.podcasts = podcastsResource.podcasts;
};

ControllerPodcast.prototype.loadRadioI18nStrings = function () {
  var self=this;

  try {
    var language_code = this.commandRouter.sharedVars.get('language_code');
    self.i18nStrings=fs.readJsonSync(__dirname+'/i18n/strings_'+language_code+".json");
  } catch(e) {
    self.i18nStrings=fs.readJsonSync(__dirname+'/i18n/strings_en.json');
  }

  self.i18nStringsDefaults=fs.readJsonSync(__dirname+'/i18n/strings_en.json');
};

ControllerPodcast.prototype.getRadioI18nString = function (key) {
  var self=this;

  if (self.i18nStrings[key] !== undefined)
    return self.i18nStrings[key];
  else
    return self.i18nStringsDefaults[key];
};

ControllerPodcast.prototype.decodeStreamUrl =
    function (algorithm, secretKey, encodedUri) {

  var decipherObj = crypto.createDecipher(algorithm, secretKey);
  var streamUrl = decipherObj.update(encodedUri, 'hex', 'utf8');
  streamUrl += decipherObj.final('utf8');

  return streamUrl;
};

ControllerPodcast.prototype.errorToast = function (station, msg) {
  var self=this;

  var errorMessage = self.getRadioI18nString(msg);
  errorMessage = errorMessage.replace('{0}', station.toUpperCase());
  self.commandRouter.pushToastMessage('error',
      self.getRadioI18nString('PLUGIN_NAME'), errorMessage);
};


