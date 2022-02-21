'use strict';

const path = require('path');
global.podcastRoot = path.resolve(__dirname);

class podcastData {
  constructor() {
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
  }

  get podcastItems() {
    return this.podcasts.items;
  }
  get maxEpisodesCount() {
    return this.podcasts.maxEpisode;
  }
  get searchedPodcasts() {
    return this.searchedPodcasts;
  }
  get selectedCountry() {
    return this.selectedCountry;
  }
  get searchKeyword() {
    return this.searchKeyword;
  }
  get i18nCountry() {
    return this.i18nCountry;
  }
  get searchResultStatus() {
    return this.hideSearchResult;
  }

  set podcastItems(podcastItems) {
    this.podcasts.items = podcastItems
  }
  set maxEpisodesCount(maxEpisodesCount){
    this.podcasts.maxEpisode = maxEpisodesCount
  }
  set searchedPodcasts(searchedPodcasts) {
    this.searchedPodcasts = searchedPodcasts
  }
  set selectedCountry(country) {
    this.selectedCountry = country;
  }
  set searchKeyword(keyword) {
    this.searchKeyword = keyword;
  }
  set i18nCountry(i18nCountry) {
    this.i18nCountry = i18nCountry;
  }
  set searchResultStatus(hideSearchResult) {
    this.hideSearchResult = hideSearchResult;
  }
}

module.exports = podcastData;
