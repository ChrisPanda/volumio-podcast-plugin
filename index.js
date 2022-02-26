'use strict';

const path = require('path');
global.podcastRoot = path.resolve(__dirname);

const libQ = require('kew');
const fs = require('fs-extra');
const podcastCore = require(podcastRoot + '/podcast-core');
const podcastBrowseUi = require(podcastRoot + '/podcast-browse-ui');
const podcastSetupUi = require(podcastRoot + '/podcast-setup-ui');

module.exports = ControllerPodcast;

function ControllerPodcast(context) {
  var self = this;

  self.context = context;
  self.commandRouter = this.context.coreCommand;
  self.configManager = this.context.configManager;
  self.logger = this.context.logger;
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
  this.serviceName = "podcast";
  this.podcastCore = new podcastCore();
  this.podcastCore.init(this);

  this.podcastBrowseUi = new podcastBrowseUi();
  this.podcastBrowseUi.init(this);

  this.podcastSetupUi = new podcastSetupUi();
  this.podcastSetupUi.init(this);

  self.addToBrowseSources();
  return libQ.resolve();
};

ControllerPodcast.prototype.onStop = function() {

  return libQ.resolve();
};

ControllerPodcast.prototype.onRestart = function() {

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
  return this.podcastSetupUi.getPodcastUIConfig();
};

ControllerPodcast.prototype.updatePodcastUIConfig = function() {
  this.podcastSetupUi.updatePodcastUIConfig();
};

ControllerPodcast.prototype.setUIConfig = function(data)
{
  var uiconf=fs.readJsonSync(__dirname+'/UIConfig.json');

  return libQ.resolve();
};

// Podcast Methods -----------------------------------------------------
ControllerPodcast.prototype.newFetchRssUrl = function(url) {
  var self=this
  var request = {
    type: 'GET',
    url: url,
    dataType: 'text',
    headers: {
      'Accept': '*/*',
      'User-Agent': 'Mozilla/5.0'
    },
    timeoutMs: 5000
  };
  const headers = request.headers || {};
  const fetchRequest = {
    headers,
    method: request.type,
    credentials: 'same-origin'
  };
  var contentType = request.contentType;
  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('==fetch timeout==')), request.timeoutMs);
    var options = fetchRequest || {};
    options.credentials = 'same-origin';

    fetch(request.url, options)
        .then(
            (response) => {
              clearTimeout(timeout);
              return response.text();
            },
            (error) => {
              clearTimeout(timeout);
              self.logger.info("ControllerPodcast::fetchRssUrl:timed out=" + request.url+", error="+error);
              reject();
            }
        )
        .then((fetchData) => {
          const options = {
            ignoreAttributes : false,
            attributeNamePrefix: ""
          };

          const parser = new XMLParser(options);
          let feed = parser.parse(fetchData);
          resolve(feed);
        })
        .catch((error) => {
          clearTimeout(timeout);
          self.logger.info('ControllerPodcast::fetchRssUrl:Error: ' + error);
          reject();
        });
  });
}

ControllerPodcast.prototype.addPodcast = function(data) {
  var rssUrl = data['input_podcast'].trim();

  return this.podcastCore.addPodcast(rssUrl);
};

ControllerPodcast.prototype.deletePodcast = function(data) {
  var self = this;
  var id = data['list_podcast'].value;
  var title = data['list_podcast'].label;

  var message = this.podcastCore.getI18nString('DELETE_CONFIRM_MESSAGE');
  message = message.replace('{0}', title);

  var modalData = {
    title: this.podcastCore.getI18nString('PLUGIN_NAME'),
    message: message,
    size: 'md',
    buttons: [
      {
        name: this.podcastCore.getI18nString('CANCEL'),
        class: 'btn btn-info'
      },
      {
        name: this.podcastCore.getI18nString('CONFIRM'),
        class: 'btn btn-primary',
        emit:'callMethod',
        payload:{'endpoint':'music_service/podcast','method':'deletePodcastConfirm','data': [id, title]}
      }
    ]
  };
  self.commandRouter.broadcastMessage("openModal", modalData);
  return libQ.resolve();
};

ControllerPodcast.prototype.deletePodcastConfirm = function(data) {

  return this.podcastCore.deletePodcast(data[0], data[1]);
};

ControllerPodcast.prototype.saveMaxEpisodeNumber = function(data) {

  const maxNum = data.max_episode[0];
  this.podcastCore.writePodcastMaxEpisodeCount(maxNum);
};

ControllerPodcast.prototype.searchPodcast = function(data) {
  return this.podcastCore.searchPodcast(data);
};

ControllerPodcast.prototype.searchAddPodcast = function(data) {
  var self = this;

  this.podcastCore.searchKeyword = "";
  const rssUrl = data.search_result_podcast.url;
  if (!rssUrl) {
    this.podcastCore.toast('error', this.podcastCore.getI18nString('MESSAGE_INVALID_PODCAST_URL'));
    return libQ.resolve();
  }

  return this.podcastCore.checkAddPodcast(rssUrl);
};

ControllerPodcast.prototype.selectCountry = function(data) {
  var self = this;

  const selectedCountry = data['country_code'];
  this.podcastCore.selectedCountry = selectedCountry;
  var message = this.podcastCore.getI18nString('CHANGED_SEARCH_REGION');
  message = message.replace('{0}', selectedCountry.label);
  this.podcastCore.toast('info', message);

  self.updatePodcastUIConfig();

  return libQ.resolve();
};

// Playback Controls ---------------------------------------------------------
ControllerPodcast.prototype.addToBrowseSources = function () {
  var self = this;

  self.commandRouter.volumioAddToBrowseSources({
    name: this.podcastCore.getI18nString('PLUGIN_NAME'),
    uri: 'podcast',
    plugin_type: 'music_service',
    plugin_name: "podcast",
    albumart: '/albumart?sourceicon=music_service/podcast/podcast.svg'
  });
};

ControllerPodcast.prototype.handleBrowseUri = function (curUri) {
  var self = this;
  var response;

  if (curUri.startsWith('podcast')) {
    if (curUri === 'podcast') {
      response = this.podcastBrowseUi.getRootContent();
    }
    else {
      response = this.podcastBrowseUi.getPodcastContent(curUri);
    }
  }

  return response
      .fail(function (e) {
        self.logger.info('ControllerPodcast::handleBrowseUri: response failed=',e);
        libQ.reject(new Error('ControllerPodcast response error'));
      });
};

ControllerPodcast.prototype.explodeUri = function (uri) {
  var self = this;
  var uris = uri.split("/");
  var response=[];

  // podcast/channel/episode
  if (uris.length < 3) {
    return libQ.reject();
  };

  const podcastId = uris[1];
  const podcastParam = uris[2];
  const podcastItem = this.podcastCore.podcastItems.find(item => item.id === podcastId);

  const episode = JSON.parse(decodeURIComponent(podcastParam));
  response.push({
    service: self.serviceName,
    type: 'track',
    uri: uri,
    trackType: this.podcastCore.getI18nString('PLUGIN_NAME'),
    name: episode.title,
    albumart: episode.albumart
      ? episode.albumart
      : podcastItem && podcastItem.image
          ? podcastItem.image
          : '/albumart?sourceicon=music_service/podcast/podcast.svg',
    serviceName: self.serviceName
  });

  return libQ.resolve(response);
};

ControllerPodcast.prototype.clearAddPlayTrack = function(track) {
  var self = this;

  var uris = track.uri.split("/");
  if (uris.length < 3) {
    return libQ.reject();
  };
  const podcastParam = uris[2];
  const episode = JSON.parse(decodeURIComponent(podcastParam));
  const trackUrl = episode.url;

  return self.mpdPlugin.sendMpdCommand('stop', [])
    .then(function() {
        return self.mpdPlugin.sendMpdCommand('clear', []);
    })
    .then(function() {
        return self.mpdPlugin.sendMpdCommand('add "'+trackUrl+'"',[]);
    })
    .then(function () {
      self.mpdPlugin.clientMpd.on('system', function (status) {
        if (status !== 'playlist' && status !== undefined) {
          self.getState().then(function (state) {
            if (state.status === 'play') {
              return self.pushState(state);
            }
          });
        }
      });

      return self.mpdPlugin.sendMpdCommand('play', []).then(function () {
        self.commandRouter.checkFavourites({uri: track.uri}).then(function(favouriteStatus) {
          self.commandRouter.emitFavourites(
              {service: self.service, uri: track.uri, favourite: favouriteStatus.favourite}
          );
        })

        return self.getState().then(function (state) {
          return self.pushState(state);
        });
      });

    })
    .fail(function (e) {
      return libQ.reject(new Error('ControllerPodcast:clearAddPlayTrack'));
    });
};

ControllerPodcast.prototype.getState = function () {
  var self = this;

  return self.mpdPlugin.sendMpdCommand('status', [])
  .then(function (objState) {
    var collectedState = self.mpdPlugin.parseState(objState);

    // If there is a track listed as currently playing, get the track info
    if (collectedState.position !== null) {
      var trackinfo=self.commandRouter.stateMachine.getTrack(self.commandRouter.stateMachine.currentPosition);
      if (collectedState.samplerate) trackinfo.samplerate = collectedState.samplerate;
      if (collectedState.bitdepth) trackinfo.bitdepth = collectedState.bitdepth;

      collectedState.isStreaming = trackinfo.isStreaming !== undefined ? trackinfo.isStreaming : false;
      collectedState.title = trackinfo.title;
      collectedState.artist = trackinfo.artist;
      collectedState.album = trackinfo.album;
      collectedState.uri = trackinfo.uri;
      collectedState.trackType = trackinfo.trackType.split('?')[0];
      collectedState.serviceName = trackinfo.serviceName;
    } else {
      collectedState.isStreaming = false;
      collectedState.title = null;
      collectedState.artist = null;
      collectedState.album = null;
      collectedState.uri = null;
      collectedState.serviceName = self.serviceName;
    }
    return collectedState;
  });
};

ControllerPodcast.prototype.pushState = function (state) {
  var self = this;

  return self.commandRouter.servicePushState(state, self.serviceName);
};

ControllerPodcast.prototype.seek = function (position) {
  var self = this;

  return self.mpdPlugin.seek(position);
};

ControllerPodcast.prototype.stop = function() {
  var self = this;

  this.podcastCore.toast('info', this.podcastCore.getI18nString('STOP_PODCAST'));

  return self.mpdPlugin.stop().then(function () {
    return self.getState().then(function (state) {
      return self.pushState(state);
    });
  });
};

ControllerPodcast.prototype.pause = function() {
  var self = this;

  return self.mpdPlugin.pause().then(function () {
    return self.getState().then(function (state) {
      return self.pushState(state);
    });
  });
};

ControllerPodcast.prototype.resume = function() {
  var self = this;

  return self.mpdPlugin.resume().then(function () {
    return self.getState().then(function (state) {
      return self.pushState(state);
    });
  });
};
