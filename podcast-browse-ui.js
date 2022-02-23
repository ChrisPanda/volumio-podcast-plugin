'use strict';

const libQ = require('kew');
const NodeCache = require('node-cache');

class podcastBrowseUi {
    constructor(context) {
        this.context = context;
        this.podcastCore = context.podcastCore
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
                            title: this.podcastCore.getI18nString('PLUGIN_NAME'),
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

            this.podcastCore.podcastItems.forEach(entry => {
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
        const targetPodcast = this.podcastCore.podcastItems.find(item => item.id === podcastId);
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

            let message = this.podcastCore.getI18nString('WAIT_PODCAST_ITEMS');
            message = message.replace('{0}', targetPodcast.title);
            this.podcastCore.toast('info', message);

            this.podcastCore.fetchRssUrl(targetPodcast.url)
                .then((feed) => {
                    let title = feed.rss.channel.title;
                    let html = `<div style="display: flex; width: 100%; align-items: flex-start; flex-direction: column">
                    <div>${title}</div>`

                    if (feed.rss.channel.lastBuildDate)
                        html += `<i><div style="flex-grow: 1; text-align: right; font-size: small;">
                            Last Build Date: ${feed.rss.channel.lastBuildDate}</div></i>`
                    if (feed.rss.channel.description)
                        html += `<div style="font-size: medium">${feed.rss.channel.description}</div>`;
                    response.navigation.lists[0].title = html;

                    if (!feed.rss.channel.item) {
                        feed.rss.channel.item = [];
                    }
                    if (!Array.isArray(feed.rss.channel.item)) {
                        let tempItem = feed.rss.channel.item;
                        feed.rss.channel.item = [];
                        feed.rss.channel.item.push(tempItem);
                    }

                    feed.rss.channel.item.some( (entry, index) => {
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
                        return (index > this.podcastCore.maxEpisodesCount);  // limits podcast episodes
                    });

                    this.cache.set(targetPodcast.id, response);
                    defer.resolve(response);
                })
                .catch((error) => {
                    this.context.logger.info('ControllerPodcast::getPodcastContent: error= ' + error);
                    this.podcastCore.toast('error',targetPodcast.title +
                        ": " + this.podcastCore.getI18nString('MESSAGE_INVALID_PODCAST_FORMAT'));
                    defer.reject();
                })
        }
        else {
            // reload current podcast items from caching
            defer.resolve(podcastResponse);
        }

        return defer.promise;
    };

    constructListTitleWithLink(title, links, isFirstList) {
        let html = `<div style="display: flex; width: 100%; align-items: flex-end;${isFirstList ? '' : ' margin-top: -24px;'}">
                    <div>${title}</div>
                    <div style="flex-grow: 1; text-align: right; font-size: small;">`;

        if (Array.isArray(links)) {
            links.forEach( (link, index) => {
                html += this.constructLinkItem(link);
                if (index < links.length - 1) {
                    html += '<span style="padding: 0px 5px;">|</span>';
                }
            })
        }
        else {
            html += this.constructLinkItem(links);
        }

        html += '</div></div>';

        return html;
    }

    constructLinkItem(link) {
        let html = '';
        if (link.icon) {
            if (link.icon.type === 'fa' && link.icon.float !== 'right') {
                html += `<i class="${link.icon.class}" style="position: relative; top: 1px; margin-right: 2px; font-size: 16px;${ link.icon.color ? ' color: ' + link.icon.color + ';': ''}"></i>`;
            }
            else if (link.icon.type === 'podcast') {
                html += `<img src="/albumart?sourceicon=${encodeURIComponent('music_service/podcast/assets/default.jpg')}" style="width: 32px; height: 32px; margin-right: 5px; margin-top: -1px;" />`;

            }
        }
        html += `<a${link.target ? ' target="' + link.target + '"' : ''}${link.style ? ' style="' + link.style + '"' : ''} href="${link.url}"${link.onclick ? ' onclick="' + link.onclick + '"' : ''}>
                    ${link.text}
                </a>`;
        if (link.icon && link.icon.type === 'fa' && link.icon.float === 'right') {
            html += `<i class="${link.icon.class}" style="position: relative; top: 1px; margin-left: 2px; font-size: 16px;${ link.icon.color ? ' color: ' + link.icon.color + ';': ''}"></i>`;
        }

        return html;
    }
}

module.exports = podcastBrowseUi;
