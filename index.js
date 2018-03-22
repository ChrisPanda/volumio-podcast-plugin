'use strict';

var libQ = require('kew');
var fs = require('fs-extra');
var config = require('v-conf');
var RssParser = require('rss-parser');
var _ = require('lodash');

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

  self.serviceName = "podcast";

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
  var lang_code = self.commandRouter.sharedVars.get('language_code');

  self.getConf(this.configFile);
  self.commandRouter.i18nJson(__dirname+'/i18n/strings_' + lang_code + '.json',
      __dirname + '/i18n/strings_en.json',
      __dirname + '/UIConfig.json')
  .then(function(uiconf)
  {
    self.podcasts.items.forEach(function (entry) {
      var podcastItem = {
        label: entry.title,
        value: entry.id
      };
      uiconf.sections[0].content[0].options.push(podcastItem);
    });
    uiconf.sections[0].content[0].value = uiconf.sections[0].content[0].options[0];

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

ControllerPodcast.prototype.errorMessage = function(message) {
  var self=this;

  var modalData = {
    title: 'Podcast Message',
    message: message,
    size: 'lg',
    buttons: [
      {
        name: 'Close',
        class: 'btn btn-info'
      }
    ]
  };
  self.commandRouter.broadcastMessage("openModal", modalData);
};

ControllerPodcast.prototype.updatePodcastUrls = function() {
  var self=this;

  var lang_code = self.commandRouter.sharedVars.get('language_code');
  self.commandRouter.i18nJson(__dirname+'/i18n/strings_' + lang_code + '.json',
      __dirname + '/i18n/strings_en.json',
      __dirname + '/UIConfig.json')
  .then(function(uiconf)
  {
    self.podcasts.items.forEach(function (entry) {
      self.configManager.pushUIConfigParam(uiconf, 'sections[0].content[0].options', {
        label: entry.title,
        value: entry.id
      });
    });
    self.configManager.setUIConfigParam(uiconf, 'sections[0].content[0].value', {
      value: self.podcasts.items[0].title,
      label: self.podcasts.items[0].title
    });

    fs.writeJsonSync(__dirname+'/podcasts_list.json', self.podcasts);
  })
  .fail(function()
  {
    new Error();
  });
};

ControllerPodcast.prototype.addPodcast = function(data) {
  var self=this;
  var defer = libQ.defer();
  var rssUrl = data['input_podcast'];

  if ((rssUrl === null) || (rssUrl.length === 0)) {
    self.errorMessage('podcast feed url is wrong');
    return;
  }

  self.logger.info("ControllerPodcast::addPodcast:" + rssUrl);
  var rssParser = new RssParser({
    customFields: {
      channel: ['image']
    }
  });

  rssParser.parseURL(rssUrl,
    function (err, feed) {
      var podcastImage, podcastItem;

      if (err) {
        self.errorMessage('podcast feed url parsing problem');
        return;
      }

      if (feed.itunes !== undefined)
        podcastImage = feed.itunes.image;
      if (feed.image !== undefined)
        podcastImage = feed.image.url;

      podcastItem = {
        id: Math.random().toString(36).substring(2, 10) +
            Math.random().toString(36).substring(2, 10),
        title: feed.title,
        url: rssUrl,
        image: podcastImage
      };
      //self.logger.info("ControllerPodcast::PODCAST:IMAGE:"+self.podcastImage);

      self.podcasts.items.push(podcastItem);
      self.updatePodcastUrls();
  });

  return defer.promise;
};

ControllerPodcast.prototype.deletePodcast = function(data) {
  var self=this;

  var id = data['list_podcast'].value;

  self.logger.info("ControllerPodcast::deletePodcast:ID:"+id);

  self.podcasts.items = _.remove(self.podcasts.items, function(item) {
    return item.id !== id;
  });
  self.logger.info("ControllerPodcast::DELETE:"+JSON.stringify(self.podcasts.items));

  self.updatePodcastUrls();
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

  self.logger.info("ControllerPodcast::handleBrowseUri:"+curUri);

  if (curUri.startsWith('podcast')) {
    if (curUri === 'podcast') {
      defer.resolve(self.getRootContent());
    }
    else {
      defer.resolve(self.getPodcastContent(curUri));
    }
  }

  return defer.promise;
};

ControllerPodcast.prototype.getRootContent = function() {
  var self=this;
  var response;
  var defer = libQ.defer();

  //self.logger.info("ControllerPodcast::getRootContent:" + JSON.stringify(self.podcasts));
  response = {
    navigation: {
      lists: [
        {
          availableListViews: [
            "list", "grid"
          ],
          items: []
        }
      ],
      prev: {
        "uri": "/"
      }
    }
  };

  response.navigation.lists[0].title = self.getRadioI18nString('PLUGIN_NAME');

  self.podcasts.items.forEach(function (entry, index) {
    var podcast = {
      service: self.serviceName,
      type: 'folder',
      title: entry.title,
      uri: 'podcast/' + index,
      albumart: entry.image
    };
    response.navigation.lists[0].items.push(podcast);
  });
  defer.resolve(response);
  return defer.promise;
};

ControllerPodcast.prototype.getPodcastContent = function(uri) {
  var self = this;
  var defer = libQ.defer();

  self.logger.info("ControllerPodcast::podcast:"+ uri);
  var rssParser = new RssParser({
    customFields: {
      channel: ['image']
    }
  });
  var uris = uri.split('/');

  var response = {
    "navigation": {
      "lists": [
        {
          "availableListViews": [
            "list", "grid"
          ],
          "items": [
          ]
        }
      ],
      "prev": {
        "uri": "podcast"
      }
    }
  };

  var message = self.getRadioI18nString('WAIT_PODCAST_ITEMS');
  message = message.replace('{0}', self.podcasts.items[uris[1]].title);
  self.commandRouter.pushToastMessage(
      'info',
      self.getRadioI18nString('PLUGIN_NAME'),
      message
  );

  rssParser.parseURL(self.podcasts.items[uris[1]].url,
    function (err, feed) {

      response.navigation.lists[0].title = feed.title;

      feed.items.forEach(function (entry) {
        var podcastItem = {
          service: self.serviceName,
          type: 'song',
          title: entry.title,
          icon: 'fa fa-podcast',
          uri: 'podcast/' + uris[1] + '/' + entry.enclosure.url
        };
        response.navigation.lists[0].items.push(podcastItem);
      });
      //self.logger.info("ControllerPodcast::PodcastArticle:RESULT:"+ JSON.stringify(response));
      defer.resolve(response);
    });

  return defer.promise;
};

ControllerPodcast.prototype.explodeUri = function (uri) {
  var self = this;
  var defer = libQ.defer();
  var uris = uri.split("/", 2);
  var response;

  self.logger.info("ControllerPodcast::explodeUri:"+uri);
  response = {
    service: self.serviceName,
    type: 'track',
    uri: uri.match(/podcast\/.\/(.*)/)[1],
    trackType: self.getRadioI18nString('PLUGIN_NAME'),
    name: self.podcasts.items[uris[1]].title,
    albumart: self.podcasts.items[uris[1]].image
  };
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
        self.getRadioI18nString('WAIT_PODCAST_CHANNEL'));

      return self.mpdPlugin.sendMpdCommand('play', []).then(function () {
          self.commandRouter.stateMachine.setConsumeUpdateService('mpd');
          return libQ.resolve();
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
      self.getRadioI18nString('STOP_PODCAST')
  );

  /*
  serviceName = self.serviceName;
  return self.mpdPlugin.stop().then(function () {
    return self.mpdPlugin.getState().then(function (state) {
      return self.commandRouter.stateMachine.syncState(state, serviceName);
    });
  });
  */
  return self.mpdPlugin.sendMpdCommand('stop', []);
};

ControllerPodcast.prototype.pause = function() {
  var self = this;
  var serviceName;
  
  self.commandRouter.pushToastMessage('info', 'PERSONAL', 'pause');

  /*
  serviceName = self.serviceName;
  return self.mpdPlugin.pause().then(function () {
    return self.mpdPlugin.getState().then(function (state) {
      return self.commandRouter.stateMachine.syncState(state, serviceName);
    });
  });
  */

  self.commandRouter.stateMachine.setConsumeUpdateService('mpd');
  return self.mpdPlugin.sendMpdCommand('pause', []);
};

ControllerPodcast.prototype.resume = function() {
  var self = this;
  var serviceName;

  self.commandRouter.pushToastMessage('info', 'PERSONAL', 'resume');

  /*
  serviceName = self.serviceName;
  return self.mpdPlugin.resume().then(function () {
    return self.mpdPlugin.getState().then(function (state) {
      return self.commandRouter.stateMachine.syncState(state, serviceName);
    });
  });
  */

  self.commandRouter.stateMachine.setConsumeUpdateService('mpd');
  return self.mpdPlugin.sendMpdCommand('play', []);
};


// resource functions for Podcast -----------------------------------
ControllerPodcast.prototype.addPodcastsResource = function() {
  var self=this;

  self.podcasts = fs.readJsonSync(__dirname+'/podcasts_list.json');
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
