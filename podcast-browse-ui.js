'use strict';

const libQ = require('kew');
const NodeCache = require('node-cache');

module.exports = PodcastBrowseUi;

function PodcastBrowseUi() {

    const init = function(context) {
        this.context = context;
        this.podcastCore = context.podcastCore
        this.cache = new NodeCache({stdTTL: 3600, checkperiod: 120});
    }

    const deleteCache = function(value) {
        this.cache.del(value);
    }
    const deleteAllCache = function() {
        this.cache.flushAll();
    }

    const getRootContent = function() {
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

            this.podcastCore.podcasts.items.forEach(entry => {
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

    const getPodcastContent = function(uri) {
        let defer = libQ.defer();
        let uris = uri.split('/');

        const podcastId = uris[1];
        const targetPodcast = this.podcastCore.podcasts.items.find(item => item.id === podcastId);
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
            .then(feed => {
                let title = feed.rss.channel.title;
                let html = `<div style="display: flex;margin: 0 0 12px;">
                <img 
                    src=${feed.rss.channel['itunes:image'].href} 
                    onerror="/albumart?sourceicon=music_service/podcast/default.jpg" 
                    width="190" 
                    height="190"
                />
                <div style="display: flex; width: 100%; align-items: flex-start; flex-direction: column; margin-left: 15px;">
                <div>${title}</div>`

                if (feed.rss.channel.lastBuildDate)
                    html += `<i><div style="flex-grow: 1; text-align: right; font-size: small;">
                        Last Build Date: ${feed.rss.channel.lastBuildDate}</div></i>`
                if (feed.rss.channel.description)
                    html += `<div style="font-size: medium; margin-top: 10px;">${feed.rss.channel.description}</div>`;

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
                    return (index > this.podcastCore.podcasts.maxEpisode);  // limits podcast episodes
                });

                html += `
                    <p>episode description
                    <a 
                        href="javascript:void(0)" 
                        onclick="document.getElementById('episode-note').style.display='block';document.getElementById('episode-background').style.display='block'"
                    >
                    here
                    </a>
                </p>
                <div id="episode-note" style="
                    display:none;
                    position: absolute;
                    color: black;
                    top: 25%;
                    left: 25%;
                    width: 50%;
                    height: 50%;
                    padding: 5px;
                    border: 2px solid orange;
                    background-color: aliceblue;
                    z-index: 1002;
                    overflow: auto;"
                >
                    This is the episodes content. 
                    <ul>
                        <li>
                        ${response.navigation.lists[0].items[0].title}
                        </li>
                        <li>
                        ${response.navigation.lists[0].items[1].title}
                        </li>
                    </ul>
                    <a href="javascript:void(0)"
                        style="color: blue; text-decoration: underline;"
                        onclick="document.getElementById('episode-note').style.display='none';document.getElementById('episode-background').style.display='none'"
                     >close description
                     </a>
                </div>
                <div id="episode-background" style="
                    display: none;
                    position: absolute;
                    top: 0%;
                    left: 0%;
                    width: 100%;
                    height: 100%;
                    background-color: black;
                    z-index: 1001;
                    -moz-opacity: 0.8;
                    opacity: .80;
                    filter: alpha(opacity=80);
                "></div>
`
                html += "</div>"
                response.navigation.lists[0].title = html;

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

    function constructListTitleWithLink(title, links, isFirstList) {
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

    function constructLinkItem(link) {
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

    return {
        init: init,
        deleteCache: deleteCache,
        deleteAllCache: deleteAllCache,
        getRootContent: getRootContent,
        getPodcastContent: getPodcastContent
    }
}
