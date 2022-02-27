'use strict';

const libQ = require('kew');
const urlModule = require('url');
const querystring = require("querystring");
const fetch = require('node-fetch');
//https://github.com/node-fetch/node-fetch#installation
//node-fetch from v3 is an ESM-only module - you are not able to import it with require().
//const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const {XMLParser} = require('fast-xml-parser');
const fs = require('fs-extra');
const RssParser = require('rss-parser');
const podcastSearchApi = 'https://itunes.apple.com';
const axios = require('axios');

module.exports = PodcastCore;

function PodcastCore () {

    this.podcasts = {
        items: [],
        maxEpisode: 100
    }
    this.searchedPodcasts = [];
    this.searchKeyword = "";
    this.selectedCountry = {};
    this.hideSearchResult = true;
    this.updatePodcastData = false;

    this.i18nCountry = {};
    this.i18nStrings = {};
    this.i18nStringsDefaults = {};

    const init = function (context) {
        let self = this
        self.context = context;
        self.podcasts = fs.readJsonSync(__dirname+'/podcasts_list.json');
        self.logger = context.logger;

        self.loadPodcastI18nStrings();
    }

    const getI18nString = function (key) {
        if (this.i18nStrings[key] !== undefined)
            return this.i18nStrings[key];
        else
            return this.i18nStringsDefaults[key];
    }

    const toast = function(type, message, title = this.getI18nString('PLUGIN_NAME')) {
        this.context.commandRouter.pushToastMessage(type, title, message);
    }

    const loadPodcastI18nStrings = function() {
        try {
            const language_code = this.context.commandRouter.sharedVars.get('language_code');
            this.i18nStrings=fs.readJsonSync(__dirname+'/i18n/strings_'+language_code+".json");
        } catch(e) {
            this.i18nStrings=fs.readJsonSync(__dirname+'/i18n/strings_en.json');
        }

        this.i18nCountry=fs.readJsonSync(__dirname+'/i18n/country_code.json');
        this.i18nStringsDefaults=fs.readJsonSync(__dirname+'/i18n/strings_en.json');
    }

    const fetchRssUrl = function(url) {
        let defer = libQ.defer();

        axios({
            method: 'get',
            url: url,
            responseType: 'text',
            timeout: 5000
        })
        .then( (response) => {
            const options = {
                ignoreAttributes: false,
                attributeNamePrefix: ""
            };

            const parser = new XMLParser(options);
            let feed = parser.parse(response);
            defer.promise(feed);
        });

        return defer.promise;
    }

    const fetchRssUrlOld= function(url) {
        let self = this
        let request = {
            type: 'GET',
            url: url,
            dataType: 'text',
            headers: {
                'Accept': '*/*',
                'User-Agent': 'Mozilla/5.0'
            }
        };
        const fetchRequest = {
            headers : request.headers,
            method: request.type,
            credentials: 'same-origin'
        };

        const fetchTimer = new Promise((resolve) => {
            let timeOutId = setTimeout(
                () => {
                    clearTimeout(timeOutId);
                    resolve({timeout: true});
                }
                , 5000
            )
        })

        return Promise.race([
            fetch(request.url, fetchRequest),
            fetchTimer
        ]).then(response => {
            if (response.timeout) {
                self.toast('error', this.getI18nString('MESSAGE_LOADING_RSS_FEED_TIMEOUT'));
                return null;
            }
            return response.text();
        })
        .then((fetchData) => {
            if (fetchData) {
                const options = {
                    ignoreAttributes: false,
                    attributeNamePrefix: ""
                };

                const parser = new XMLParser(options);
                let feed = parser.parse(fetchData);
                return feed;
            }
            return null;
        })
        .catch((error) => {
            self.logger.info('ControllerPodcast::fetchRssUrl:Error: ' + request.url + ", error=" + error);
        })
    }

    const checkAddPodcast = function(rssUrl) {
        let self = this
        let message;

        let urlObj = urlModule.parse(rssUrl);
        // exception handling for ssenhosting host url
        try {
            if (urlObj.hostname === "pod.ssenhosting.com") {
                let pathValues = urlObj.pathname.substring(1).split("/");
                if (pathValues.length === 2) {
                    pathValues[1] = pathValues[1].split(".").shift();
                }
                if (pathValues.length === 3) {
                    pathValues.splice(2, 1);
                }
                rssUrl = `${urlObj.protocol}//${urlObj.hostname}/${pathValues.join("/")}`
            }
        }
        catch (error) {
            self.logger.info('ControllerPodcast::checkAddPodcast:ssenhosting: Error: ' + error);
            self.toast('error', this.getI18nString('MESSAGE_INVALID_PODCAST_FORMAT'));
            return;
        }

        let findItem = self.podcasts.items.find( item => item.url === rssUrl);
        if (findItem) {
            self.toast('info', this.getI18nString('DUPLICATED_PODCAST'));
            return;
        }
        self.toast('info', this.getI18nString('ADD_PODCAST_PROCESSING'));

        self.fetchRssUrl(rssUrl)
        .then(feed => {
            if (!feed) return;

            let imageUrl, podcastItem;

            if ( feed.rss.channel.image && feed.rss.channel.image.url )
                imageUrl = feed.rss.channel.image.url;
            else if ( feed.rss.channel['itunes:image'] )
                imageUrl = feed.rss.channel['itunes:image'].href;
            else if ( feed.rss.channel.itunes && feed.rss.channel.itunes.image )
                imageUrl = feed.rss.channel.itunes.image;

            // check validation of image url
            let validUrl;
            try {
                const checkUrl = new URL(imageUrl);
                validUrl = checkUrl.protocol === "http:" || checkUrl.protocol === "https:"
            }
            catch (_) {
                validUrl = false;
            }
            if (!validUrl)
                imageUrl = '/albumart?sourceicon=music_service/podcast/default.jpg';

            const feedTitle = feed.rss.channel.title;
            podcastItem = {
                id: Math.random().toString(36).substring(2, 10) +
                    Math.random().toString(36).substring(2, 10),
                title: feedTitle,
                url: rssUrl,
                image: imageUrl
            };

            self.podcasts.items.push(podcastItem);
            self.updatePodcastData = true;
            self.hideSearchResult = true;
            self.context.updatePodcastUIConfig();

            message = this.getI18nString('ADD_PODCAST_COMPLETION');
            message = message.replace('{0}', feedTitle);
            self.toast('success', message);
        })
        .catch(error => {
            self.logger.info('ControllerPodcast::checkAddPodcast: Error: ' + error);
            self.toast('error', this.getI18nString('MESSAGE_INVALID_PODCAST_FORMAT'));
        })
    }

    const newCheckAddPodcast = function(rssUrl) {
        let self = this
        let message;

        let urlObj = urlModule.parse(rssUrl);
        // exception handling for ssenhosting host url
        try {
            if (urlObj.hostname === "pod.ssenhosting.com") {
                let pathValues = urlObj.pathname.substring(1).split("/");
                if (pathValues.length === 2) {
                    pathValues[1] = pathValues[1].split(".").shift();
                }
                if (pathValues.length === 3) {
                    pathValues.splice(2, 1);
                }
                rssUrl = `${urlObj.protocol}//${urlObj.hostname}/${pathValues.join("/")}`
            }
        }
        catch (error) {
            self.logger.info('ControllerPodcast::checkAddPodcast:ssenhosting: Error: ' + error);
            self.toast('error', self.getI18nString('MESSAGE_INVALID_PODCAST_FORMAT'));
            return;
        }

        let findItem = self.podcasts.items.find( item => item.url === rssUrl);
        if (findItem) {
            self.toast('info', self.getI18nString('DUPLICATED_PODCAST'));
            return;
        }
        self.toast('info', self.getI18nString('ADD_PODCAST_PROCESSING'));

        const rssParser = new RssParser({
            headers: {
                'Accept': '*/*',
                'User-Agent': 'Mozilla/5.0'
            },
            feed: {
                channel: ['image']
            }
        });
        rssParser.parseURL(rssUrl,
            (err, feed) => {
                if (err) {
                    self.toast('error',  self.getI18nString('MESSAGE_INVALID_PODCAST_FORMAT'));
                    return;
                }

                let imageUrl, podcastItem;

                if ( (feed.image !== undefined) && (feed.image.url !== undefined) )
                    imageUrl = feed.image.url;
                else if ( (feed.itunes !== undefined)  && (feed.itunes.image !== undefined) )
                    imageUrl = feed.itunes.image;

                // check validation of image url
                let validUrl;
                try {
                    const checkUrl = new URL(imageUrl);
                    validUrl = checkUrl.protocol === "http:" || checkUrl.protocol === "https:"
                }
                catch (_) {
                    validUrl = false;
                }
                if (!validUrl)
                    imageUrl = '/albumart?sourceicon=music_service/podcast/default.jpg';

                const feedTitle = feed.title;
                podcastItem = {
                    id: Math.random().toString(36).substring(2, 10) +
                        Math.random().toString(36).substring(2, 10),
                    title: feedTitle,
                    url: rssUrl,
                    image: imageUrl
                };

                self.podcasts.items.push(podcastItem);
                self.updatePodcastData = true;
                self.hideSearchResult = true;
                self.context.updatePodcastUIConfig();

                message = this.getI18nString('ADD_PODCAST_COMPLETION');
                message = message.replace('{0}', feedTitle);
                self.toast('success', message);
            })
            .catch(error => {
                self.logger.info('ControllerPodcast::checkAddPodcast: Error: ' + error);
                self.toast('error', this.getI18nString('MESSAGE_INVALID_PODCAST_FORMAT'));
            })
    }

    const searchPodcast= function(data) {
        let self = this
        let defer = libQ.defer();
        const searchPodcast = data['search_keyword'].trim();

        self.searchKeyword = searchPodcast;
        if (!searchPodcast) {
            self.toast('error', this.getI18nString('MESSAGE_ERROR_INPUT_KEYWORD'));
            return libQ.resolve();
        }

        self.searchedPodcasts = [];
        let message = this.getI18nString('SEARCHING_WAIT_PODCAST');
        message = message.replace('{0}', self.selectedCountry.label);
        self.toast('info', message);

        const country = self.selectedCountry.value;
        let query = {
            term: searchPodcast.trim(),
            country: country,
            media: 'podcast',
            lang: 'en_us',
            limit: 30
        };
        const queryParam = querystring.stringify(query);
        const options = {
            headers: {
                'Accept': '*/*',
                'User-Agent': 'Mozilla/5.0'
            },
            method: 'GET'
        };

        fetch(`${podcastSearchApi}/${country}/search?${queryParam}`, options)
            .then((response) => response.json())
            .then((items) => {
                if (!items || items.resultCount === 0) {
                    self.hideSearchResult = true;
                    self.toast('info', this.getI18nString('MESSAGE_NONE_SEARCH_RESULT_PODCAST'));
                } else {
                    self.hideSearchResult = false;
                    items.results.some(entry => {
                        let item = {
                            title: entry.collectionName,
                            url: entry.feedUrl
                        }
                        self.searchedPodcasts.push(item);
                    });
                    self.toast('info', this.getI18nString('MESSAGE_SUCCESS_SEARCH_RESULT_PODCAST'));
                }
                self.context.updatePodcastUIConfig();
                defer.resolve();
            })
            .catch(error => {
                self.logger.info('ControllerPodcast::searchPodcast: Error: ' + error);
                self.toast('error', this.getI18nString('SEARCH_PODCAST_ERROR'));
                defer.resolve();
            });

        return defer.promise;
    }

    const addPodcast= function(rssUrl) {
        if (!rssUrl) {
            this.toast('error', this.getI18nString('MESSAGE_ERROR_INPUT_RSS_URL'));
            return libQ.resolve();
        }
        return checkAddPodcast(rssUrl);
    }

    const deletePodcast= function(id, title) {
        let self = this
        let message, messageType;

        const index = this.podcasts.items.map(item => item.id).indexOf(id);
        if (index > -1) {
            self.podcasts.items.splice(index, 1);

            self.updatePodcastData = true;
            self.hideSearchResult = true;
            self.context.updatePodcastUIConfig();
            message = this.getI18nString('DELETE_PODCAST_COMPLETION');
            messageType = 'success';
        }
        else {
            message = this.getI18nString('DELETE_PODCAST_ERROR');
            messageType = 'error';
        }
        message = message.replace('{0}', title);
        self.toast(messageType, message);
        return libQ.resolve();
    }

    const writePodcastItems= function() {
        if (this.updatePodcastData) {
            this.context.podcastBrowseUi.deleteCache('root');
            fs.writeJsonSync(__dirname+'/podcasts_list.json', this.podcasts);
            this.updatePodcastData = false;
        }
    }

    const writePodcastMaxEpisodeCount= function(maxNum) {
        this.podcasts.maxEpisode = maxNum;
        fs.writeJsonSync(__dirname+'/podcasts_list.json', this.podcasts);

        this.context.podcastBrowseUi.deleteAllCache();

        let message = this.getI18nString('CHANGED_MAX_EPISODE');
        message = message.replace('{0}', maxNum);
        this.toast('info', message);
    }

    return {
        init: init,
        toast: toast,
        getI18nString: getI18nString,
        loadPodcastI18nStrings: loadPodcastI18nStrings,
        fetchRssUrl: fetchRssUrl,
        fetchRssUrlOld: fetchRssUrlOld,
        checkAddPodcast: checkAddPodcast,
        newCheckAddPodcast: newCheckAddPodcast,
        searchPodcast: searchPodcast,
        addPodcast: addPodcast,
        deletePodcast: deletePodcast,
        writePodcastItems: writePodcastItems,
        writePodcastMaxEpisodeCount: writePodcastMaxEpisodeCount
    }
}

