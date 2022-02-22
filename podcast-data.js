'use strict';

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

  get podcasts() {
    return this._podcasts;
  }
  set podcasts(podcasts) {
    this._podcasts = podcasts;
  }

  get podcastItems() {
    return this._podcasts.items;
  }
  set podcastItems(podcastItems) {
    this._podcasts.items = podcastItems
  }

  get maxEpisodesCount() {
    return this._podcasts.maxEpisode;
  }
  set maxEpisodesCount(maxEpisodesCount){
    this._podcasts.maxEpisode = maxEpisodesCount
  }

  get searchedPodcasts() {
    return this._searchedPodcasts;
  }
  set searchedPodcasts(searchedPodcasts) {
    this._searchedPodcasts = searchedPodcasts
  }

  get selectedCountry() {
    return this._selectedCountry;
  }
  set selectedCountry(country) {
    this._selectedCountry = country;
  }

  get searchKeyword() {
    return this._searchKeyword;
  }
  set searchKeyword(keyword) {
    this._searchKeyword = keyword;
  }

  get i18nCountry() {
    return this._i18nCountry;
  }
  set i18nCountry(i18nCountry) {
    this._i18nCountry = i18nCountry;
  }

  get i18nStrings() {
    return this._i18nStrings;
  }
  set i18nStrings(i18nStrings) {
    this._i18nStrings = i18nStrings;
  }

  get i18nStringsDefaults() {
    return this._i18nStringsDefaults;
  }
  set i18nStringsDefaults(i18nStringsDefaults) {
    this._i18nStringsDefaults = i18nStringsDefaults
  }

  get hideSearchResult() {
    return this._hideSearchResult;
  }
  set hideSearchResult(hideSearchResult) {
    this._hideSearchResult = hideSearchResult;
  }

  get updatePodcastData() {
    return this._updatePodcastData;
  }
  set updatePodcastData(updatePodcastData) {
    this._updatePodcastData = updatePodcastData;
  }
}

module.exports = podcastData;
