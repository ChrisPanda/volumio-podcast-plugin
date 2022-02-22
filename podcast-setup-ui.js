'use strict';

const libQ = require('kew');

class podcastSetupUi {

    constructor(context) {
        this.context = context;
        this.commandRouter = context.commandRouter
        this.configManager = context.configManager
        this.podcastCore = context.podcastCore
    }

    getPodcastUIConfig() {
        let defer = libQ.defer();
        const lang_code = this.commandRouter.sharedVars.get('language_code');

        this.context.getConf(this.context.configFile);
        this.commandRouter.i18nJson(__dirname+'/i18n/strings_' + lang_code + '.json',
            __dirname + '/i18n/strings_en.json',
            __dirname + '/UIConfig.json')
            .then((uiconf) => {
                // setup user selected podcast list
                this.podcastCore.podcastItems.forEach(entry => {
                    let podcastItem = {
                        label: entry.title,
                        value: entry.id
                    };
                    uiconf.sections[3].content[0].options.push(podcastItem);
                });
                uiconf.sections[3].content[0].value = uiconf.sections[3].content[0].options[0];

                // setup podcast search region list
                const i18nCountry = this.podcastCore.i18nCountry;
                for (const entry in i18nCountry) {
                    let countryItem = {
                        label: i18nCountry[entry].country_name,
                        value: i18nCountry[entry].country_code,
                        langCode: i18nCountry[entry].language_code
                    };

                    uiconf.sections[0].content[0].options.push(countryItem);
                }

                const foundRegions = uiconf.sections[0].content[0].options.find(item => item.langCode === lang_code);
                if (foundRegions) {
                    uiconf.sections[0].content[0].value = foundRegions;
                    this.podcastCore.selectedCountry = foundRegions;
                }
                else {
                    uiconf.sections[0].content[0].value = uiconf.sections[0].content[0].options[0];
                    this.podcastCore.selectedCountry = uiconf.sections[0].content[0].options[0];
                }

                // setup max episode number
                const maxEpisodeConfig = uiconf.sections[5].content[0].config;
                maxEpisodeConfig.bars[0].value = this.podcastCore.maxEpisodesCount;
                uiconf.sections[5].content[0].value = maxEpisodeConfig.value;

                defer.resolve(uiconf);
            })
            .fail(function()
            {
                defer.reject(new Error());
            });

        return defer.promise;
    }

    updatePodcastUIConfig() {
        let lang_code = this.commandRouter.sharedVars.get('language_code');
        this.commandRouter.i18nJson(__dirname+'/i18n/strings_' + lang_code + '.json',
            __dirname + '/i18n/strings_en.json',
            __dirname + '/UIConfig.json')
            .then((uiconf) => {
                // setup search regions
                for (const entry in this.podcastCore.i18nCountry) {
                    this.configManager.pushUIConfigParam(uiconf, 'sections[0].content[0].options', {
                        label: this.podcastCore.i18nCountry[entry].country_name,
                        value: this.podcastCore.i18nCountry[entry].country_code
                    });
                }
                this.configManager.setUIConfigParam(uiconf, 'sections[0].content[0].value', this.podcastCore.selectedCountry);

                // setup podcast search result section
                const hideSearchResult = this.podcastCore.hideSearchResult;
                if (!hideSearchResult) {
                    const searchedPodcasts = this.podcastCore.searchedPodcasts;
                    searchedPodcasts.forEach(entry => {
                        this.configManager.pushUIConfigParam(uiconf,
                            'sections[1].content[0].options', {
                                label: entry.title,
                                value: entry.title,
                                url: entry.url
                            });
                    });
                    this.configManager.setUIConfigParam(uiconf,
                        'sections[1].content[0].value', {
                            label: searchedPodcasts[0].title,
                            value: searchedPodcasts[0].title,
                            url: searchedPodcasts[0].url
                        });
                }
                this.configManager.setUIConfigParam(uiconf, 'sections[1].hidden', hideSearchResult);

                // setup search keyword value
                this.configManager.setUIConfigParam(uiconf, 'sections[2].content[0].value', this.podcastCore.searchKeyword);

                const podcastsItems = this.podcastCore.podcastItems;
                // setup selected podcast items
                podcastsItems.forEach(entry => {
                    this.configManager.pushUIConfigParam(uiconf, 'sections[3].content[0].options', {
                        label: entry.title,
                        value: entry.id
                    });
                });
                this.configManager.setUIConfigParam(uiconf, 'sections[3].content[0].value', {
                    value: podcastsItems[0].title,
                    label: podcastsItems[0].title
                });

                // setup max episode number
                let maxEpisodeConfig = uiconf.sections[5].content[0].config;
                maxEpisodeConfig.bars[0].value = this.podcastCore.maxEpisodesCount;
                this.configManager.setUIConfigParam(uiconf, 'sections[5].content[0].config', maxEpisodeConfig);

                this.podcastCore.writePodcastItems();
                this.commandRouter.broadcastMessage('pushUiConfig', uiconf);
            })
            .fail(function()
            {
                new Error();
            });
    }
}

module.exports = podcastSetupUi;
