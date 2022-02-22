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
    return this.podcasts;
  }
  set podcasts(podcasts) {
    this.podcasts = podcasts;
  }

  get podcastItems() {
    return this.podcasts.items;
  }
  set podcastItems(podcastItems) {
    this.podcasts.items = podcastItems
  }

  get maxEpisodesCount() {
    return this.podcasts.maxEpisode;
  }
  set maxEpisodesCount(maxEpisodesCount){
    this.podcasts.maxEpisode = maxEpisodesCount
  }

  get searchedPodcasts() {
    return this.searchedPodcasts;
  }
  set searchedPodcasts(searchedPodcasts) {
    this.searchedPodcasts = searchedPodcasts
  }

  get selectedCountry() {
    return this.selectedCountry;
  }
  set selectedCountry(country) {
    this.selectedCountry = country;
  }

  get searchKeyword() {
    return this.searchKeyword;
  }
  set searchKeyword(keyword) {
    this.searchKeyword = keyword;
  }

  get i18nCountry() {
    return this.i18nCountry;
  }
  set i18nCountry(i18nCountry) {
    this.i18nCountry = i18nCountry;
  }

  get i18nStrings() {
    return this.i18nStrings;
  }
  set i18nStrings(i18nStrings) {
    this.i18nStrings = i18nStrings;
  }

  get i18nStringsDefaults() {
    return this.i18nStringsDefaults;
  }
  set i18nStringsDefaults(i18nStringsDefaults) {
    this.i18nStringsDefaults = i18nStringsDefaults
  }

  get hideSearchResult() {
    return this.hideSearchResult;
  }
  set hideSearchResult(hideSearchResult) {
    this.hideSearchResult = hideSearchResult;
  }

  get updatePodcastData() {
    return this.updatePodcastData;
  }
  set updatePodcastData(updatePodcastData) {
    this.updatePodcastData = updatePodcastData;
  }
}

module.exports = podcastData;
