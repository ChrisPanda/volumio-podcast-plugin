'use strict';

const path = require('path');
global.podcastRoot = path.resolve(__dirname);

const podcast = require(podcastRoot + '/podcast');
const libQ = require('kew');

class podcastSetupUi {

    init(context) {
        this.context = context;
    }

    getPodcastUIConfig() {
        let defer = libQ.defer();
        const lang_code = this.context.commandRouter.sharedVars.get('language_code');

        this.context.getConf(this.context.configFile);
        this.context.commandRouter.i18nJson(__dirname+'/i18n/strings_' + lang_code + '.json',
            __dirname + '/i18n/strings_en.json',
            __dirname + '/UIConfig.json')
            .then(function(uiconf)
            {
                // setup user selected podcast list
                podcast.getPodcastsItems().forEach(function (entry) {
                    let podcastItem = {
                        label: entry.title,
                        value: entry.id
                    };
                    uiconf.sections[3].content[0].options.push(podcastItem);
                });
                uiconf.sections[3].content[0].value = uiconf.sections[3].content[0].options[0];

                // setup podcast search region list
                const i18nCountry = podcast.getI18nCountry();
                for (const entry in i18nCountry) {
                    let countryItem = {
                        label: i18nCountry[entry].country_name,
                        value: i18nCountry[entry].country_code,
                        langCode: i18nCountry[entry].language_code
                    };

                    uiconf.sections[0].content[0].options.push(countryItem);
                };

                const foundRegions = uiconf.sections[0].content[0].options.find(item => item.langCode === lang_code);
                if (foundRegions) {
                    uiconf.sections[0].content[0].value = foundRegions;
                    podcast.setSelectedCountry(foundRegions);
                }
                else {
                    uiconf.sections[0].content[0].value = uiconf.sections[0].content[0].options[0];
                    podcast.setSelectedCountry(uiconf.sections[0].content[0].options[0]);
                }

                // setup max episode number
                const maxEpisodeConfig = uiconf.sections[5].content[0].config;
                maxEpisodeConfig.bars[0].value = podcast.getMaxEpisodesCount();
                uiconf.sections[5].content[0].value = maxEpisodeConfig.value;

                defer.resolve(uiconf);
            })
            .fail(function()
            {
                defer.reject(new Error());
            });

        return defer.promise;
    };

    updatePodcastUIConfig() {
        let lang_code = this.context.commandRouter.sharedVars.get('language_code');
        this.context.commandRouter.i18nJson(__dirname+'/i18n/strings_' + lang_code + '.json',
            __dirname + '/i18n/strings_en.json',
            __dirname + '/UIConfig.json')
            .then(function(uiconf)
            {
                // setup search regions
                for (const entry in this.context.i18nCountry) {
                    this.context.commandRouter.configManager.pushUIConfigParam(uiconf, 'sections[0].content[0].options', {
                        label: this.context.i18nCountry[entry].country_name,
                        value: this.context.i18nCountry[entry].country_code
                    });
                };
                this.context.commandRouter.setUIConfigParam(uiconf, 'sections[0].content[0].value', podcast.getSelectedCountry());

                // setup podcast search result section
                const hideSearchResult = podcast.getSearchResultStatus();
                if (!hideSearchResult) {
                    const searchedPodcasts = podcast.getSearchedPodcasts();
                    searchedPodcasts.forEach(entry => {
                        this.context.commandRouter.pushUIConfigParam(uiconf,
                            'sections[1].content[0].options', {
                                label: entry.title,
                                value: entry.title,
                                url: entry.url
                            });
                    });
                    this.context.commandRouter.setUIConfigParam(uiconf,
                        'sections[1].content[0].value', {
                            label: searchedPodcasts[0].title,
                            value: searchedPodcasts[0].title,
                            url: searchedPodcasts[0].url
                        });
                }
                this.context.commandRouter.configManager.setUIConfigParam(uiconf, 'sections[1].hidden', hideSearchResult);

                // setup search keyword value
                this.context.commandRouter.configManager.setUIConfigParam(uiconf, 'sections[2].content[0].value', podcast.getSearchKeyword());

                const podcastsItems = podcast.getPodcastsItems();
                // setup selected podcast items
                podcastsItems.forEach(entry => {
                    this.context.configManager.pushUIConfigParam(uiconf, 'sections[3].content[0].options', {
                        label: entry.title,
                        value: entry.id
                    });
                });
                this.context.commandRouter.configManager.setUIConfigParam(uiconf, 'sections[3].content[0].value', {
                    value: podcastsItems[0].title,
                    label: podcastsItems[0].title
                });

                // setup max episode number
                let maxEpisodeConfig = uiconf.sections[5].content[0].config;
                maxEpisodeConfig.bars[0].value = podcast.getMaxEpisodesCount();
                this.context.configManager.setUIConfigParam(uiconf, 'sections[5].content[0].config', maxEpisodeConfig);

                podcast.writePodcastItems();
                this.context.commandRouter.broadcastMessage('pushUiConfig', uiconf);
            })
            .fail(function()
            {
                new Error();
            });
    };
}

module.exports = new podcastSetupUi();