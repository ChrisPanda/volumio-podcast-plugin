'use strict';

const path = require('path');
global.podcastRoot = path.resolve(__dirname);

const libQ = require('kew');
const podcast = require(podcastRoot + '/podcast');
const NodeCache = require('node-cache');

class podcastBrowseUi {
    init(context) {
        this.context = context;
        this.cache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
    }

    deleteCache(value) {
        this.cache.del(value);
    }
    deleteAllCache() {
        this.cache.flushAll();
    }

    getRootContent() {
        let response;

        let value = this.cache.get('root');
        if (value === undefined) {
            response = {
                navigation: {
                    lists: [
                        {
                            title: podcast.getI18nString('PLUGIN_NAME'),
                            icon: 'fa fa-podcast',
                            availableListViews: ["list", "grid"],
                            items: []
                        }
                    ],
                    prev: {
                        "uri": "/"
                    }
                }
            };

            podcast.getPodcastsItems().forEach(entry => {
                let imageUrl;

                imageUrl = entry.image;
                if (imageUrl === undefined)
                    imageUrl = '/albumart?sourceicon=music_service/podcast/default.jpg';

                let podcast = {
                    service: this.context.serviceName,
                    type: 'folder',
                    title: entry.title,
                    uri: (entry.custom !== undefined) ? `podcast/${entry.custom}` : `podcast/${entry.id}`,
                    albumart: imageUrl
                };
                response.navigation.lists[0].items.push(podcast);
            });

            this.cache.set('root', response);
            return libQ.resolve(response);
        }
        else {
            return libQ.resolve(value)
        }
    }

    getPodcastContent(uri) {
        let defer = libQ.defer();
        let uris = uri.split('/');

        const podcastId = uris[1];
        const targetPodcast = podcast.getPodcastsItems().find(item => item.id === podcastId);
        let podcastResponse = this.cache.get(targetPodcast.id);
        if (podcastResponse === undefined) {
            let response = {
                "navigation": {
                    "lists": [
                        {
                            icon: 'fa fa-podcast',
                            "availableListViews": [
                                "list", "grid"
                            ],
                            "items": []
                        }
                    ],
                    "prev": {
                        "uri": "podcast"
                    }
                }
            };

            let message = podcast.getI18nString('WAIT_PODCAST_ITEMS');
            message = message.replace('{0}', targetPodcast.title);
            podcast.toast('info', message);

            podcast.fetchRssUrl(targetPodcast.url)
                .then((feed) => {
                    response.navigation.lists[0].title = feed.rss.channel.title;

                    if (!feed.rss.channel.item) {
                        feed.rss.channel.item = [];
                    }
                    if (!Array.isArray(feed.rss.channel.item)) {
                        let tempItem = feed.rss.channel.item;
                        feed.rss.channel.item = [];
                        feed.rss.channel.item.push(tempItem);
                    }

                    feed.rss.channel.item.some(function (entry, index) {
                        if (entry.enclosure && entry.enclosure.url) {
                            let imageUrl;
                            if ((entry.image !== undefined) && (entry.image.url !== undefined))
                                imageUrl = entry.image.url;
                            else if ((entry['itunes:image'] !== undefined) && (entry['itunes:image'].href !== undefined))
                                imageUrl = entry['itunes:image'].href;
                            else if (entry.image !== undefined)
                                imageUrl = entry.image

                            const param = {
                                title: entry.title,
                                url: entry.enclosure.url,
                                albumart: imageUrl
                            }
                            const urlParam = JSON.stringify(param);
                            let podcastItem = {
                                service: this.context.serviceName,
                                type: 'mywebradio',
                                title: entry.title,
                                uri: `podcast/${podcastId}/${encodeURIComponent(urlParam)}`
                            };
                            if (imageUrl)
                                podcastItem.albumart = imageUrl
                            else
                                podcastItem.icon = 'fa fa-podcast'

                            response.navigation.lists[0].items.push(podcastItem);
                        }
                        return (index > podcast.getMaxEpisodesCount());  // limits podcast episodes
                    });

                    this.cache.set(targetPodcast.id, response);
                    defer.resolve(response);
                })
                .catch((error) => {
                    podcast.logger.info('ControllerPodcast::getPodcastContent: error= ' + error);
                    podcast.toast('error',targetPodcast.title +
                        ": " + podcast.getI18nString('MESSAGE_INVALID_PODCAST_FORMAT'));
                    defer.reject();
                })
        }
        else {
            // reload current podcast items from caching
            defer.resolve(podcastResponse);
        }

        return defer.promise;
    };
}

module.exports = new podcastBrowseUi();
