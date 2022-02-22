'use strict';

const path = require('path');
global.podcastRoot = path.resolve(__dirname);

const libQ = require('kew');
const urlModule = require('url');
const querystring = require("querystring");
const fetch = require('node-fetch');
const {XMLParser} = require('fast-xml-parser');
const fs = require('fs-extra');
const podcastData = require(podcastRoot + '/podcast-data');

class podcastCore extends podcastData {
    constructor() {
        super();
        this.podcastSearchApi = 'https://itunes.apple.com';
    }

    init(context) {
        this.context = context;

        this.loadPodcastI18nStrings();
        this.podcasts = fs.readJsonSync(__dirname+'/podcasts_list.json');
    }

    logger() {
        return this.context.commandRouter.logger;
    }

    toast(type, message, title = this.getI18nString('PLUGIN_NAME')) {
        this.context.commandRouter.pushToastMessage(type, title, message);
    }

    getI18nString = function (key) {
        if (this.i18nStrings[key] !== undefined)
            return this.i18nStrings[key];
        else
            return this.i18nStringsDefaults[key];
    };

    loadPodcastI18nStrings() {
        try {
            const language_code = this.context.commandRouter.sharedVars.get('language_code');
            this.i18nStrings=fs.readJsonSync(__dirname+'/i18n/strings_'+language_code+".json");
        } catch(e) {
            this.i18nStrings=fs.readJsonSync(__dirname+'/i18n/strings_en.json');
        }

        this.i18nCountry=fs.readJsonSync(__dirname+'/i18n/country_code.json');
        this.i18nStringsDefaults=fs.readJsonSync(__dirname+'/i18n/strings_en.json');
    }

    fetchRssUrl(url) {
        let request = {
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
        let contentType = request.contentType;
        if (contentType) {
            headers['Content-Type'] = contentType;
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(reject, request.timeoutMs);
            let options = fetchRequest || {};
            options.credentials = 'same-origin';

            fetch(request.url, options).then(
                (response) => {
                    clearTimeout(timeout);
                    return response;
                },
                (error) => {
                    clearTimeout(timeout);
                    this.logger().info("ControllerPodcast::fetchRssUrl:timed out: ["+
                        Date.now() + "] url=" + request.url+", error="+error);
                    reject();
                }
            )
                .then((response) => response.text())
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
                    this.logger.info('ControllerPodcast::fetchRssUrl: [' +
                        Date.now() + '] ' + '[Podcast] Error: ' + error);
                    reject();
                });
        });
    }

    checkAddPodcast(rssUrl) {
        let defer = libQ.defer();
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
            this.logger.info('ControllerPodcast::checkAddPodcast:ssenhosting: [' +
                Date.now() + '] ' + '[Podcast] Error: ' + error);
            this.toast('error',
                this.getI18nString('MESSAGE_INVALID_PODCAST_FORMAT'));
            defer.reject();
            return;
        }

        let findItem = this.podcastItems.find( item => item.url === rssUrl);
        if (findItem) {
            this.toast('info', this.getI18nString('DUPLICATED_PODCAST'));
            defer.resolve();
            return;
        }
        this.toast('info', this.getI18nString('ADD_PODCAST_PROCESSING'));

        this.fetchRssUrl(rssUrl)
            .then((feed) => {
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

                this.podcastItems.push(podcastItem);
                this.updatePodcastData = true;
                this.hideSearchResult = true;
                this.context.updatePodcastUIConfig();

                message = this.getI18nString('ADD_PODCAST_COMPLETION');
                message = message.replace('{0}', feedTitle);
                this.toast('success', message);

                defer.resolve();
            })
            .catch(error => {
                this.logger.info('ControllerPodcast::checkAddPodcast: [' +
                    Date.now() + '] ' + '[Podcast] Error: ' + error);
                this.toast('error',
                    this.getI18nString('MESSAGE_INVALID_PODCAST_FORMAT'));
                defer.reject();
            })

        return defer.promise;
    }

    searchPodcast(data) {
        let defer = libQ.defer();
        const searchPodcast = data['search_keyword'].trim();;

        this.searchKeyword = searchPodcast;
        if (!searchPodcast) {
            this.toast('error', this.getI18nString('MESSAGE_ERROR_INPUT_KEYWORD'));
            return libQ.resolve();
        }

        this.searchedPodcasts = [];
        let message = this.getI18nString('SEARCHING_WAIT_PODCAST');
        message = message.replace('{0}', this.selectedCountry.label);
        this.toast('info', message);

        const country = this.selectedCountry.value;
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

        fetch(`${this.podcastSearchApi}/${country}/search?${queryParam}`, options)
            .then((response) => response.json())
            .then((items) => {
                if (!items || items.resultCount === 0) {
                    this.hideSearchResult = true;
                    this.toast('info', this.getI18nString('MESSAGE_NONE_SEARCH_RESULT_PODCAST'));
                } else {
                    this.hideSearchResult = false;
                    items.results.some(entry => {
                        let item = {
                            title: entry.collectionName,
                            url: entry.feedUrl
                        }
                        this.searchedPodcasts.push(item);
                    });
                    this.toast('info', this.getI18nString('MESSAGE_SUCCESS_SEARCH_RESULT_PODCAST'));
                };
                this.context.updatePodcastUIConfig();
                defer.resolve();
            })
            .catch(error => {
                this.logger.info('ControllerPodcast::searchPodcast: [' +
                    Date.now() + '] ' + '[Podcast] Error: ' + error);
                defer.resolve();
                this.toast('error', this.getI18nString('SEARCH_PODCAST_ERROR'));
            });

        return defer.promise;
    };

    addPodcast(rssUrl) {
        if (!rssUrl) {
            this.toast('error', this.getI18nString('MESSAGE_ERROR_INPUT_RSS_URL'));
            return libQ.resolve();
        }
        return this.checkAddPodcast(rssUrl);
    };

    deletePodcast(id, title) {
        let message, messageType;

        const index = this.podcastItems.map(item => item.id).indexOf(id);
        if (index > -1) {
            this.podcasts.items.splice(index, 1);

            this.updatePodcastData = true;
            this.hideSearchResult = true;
            this.context.updatePodcastUIConfig();
            message = this.getI18nString('DELETE_PODCAST_COMPLETION');
            messageType = 'success';
        }
        else {
            message = this.getI18nString('DELETE_PODCAST_ERROR');
            messageType = 'error';
        }
        message = message.replace('{0}', title);
        this.toast(messageType, message);
        return libQ.resolve();
    };

    writePodcastItems() {
        if (this.updatePodcastData) {
            this.context.podcastBrowseUi.deleteCache('root');
            fs.writeJsonSync(__dirname+'/podcasts_list.json', this.podcasts);
            this.updatePodcastData = false;
        }
    }

    writePodcastMaxEpisodeCount(maxNum) {
        this.maxEpisodesCount = maxNum;
        fs.writeJsonSync(__dirname+'/podcasts_list.json', this.podcasts);

        this.context.podcastBrowseUi.deleteAllCache();

        let message = this.getI18nString('CHANGED_MAX_EPISODE');
        message = message.replace('{0}', maxNum);
        this.toast('info', message);
    }
}

module.exports = podcastCore;
