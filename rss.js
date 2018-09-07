var libQ = require('kew');
var zlib = require('zlib');
var FeedParser = require('feedparser');
var request = require('request');
var _ = require('lodash');

function maybeDecompress (res, encoding) {
  var decompress;
  if (encoding.match(/\bdeflate\b/)) {
    decompress = zlib.createInflate();
  } else if (encoding.match(/\bgzip\b/)) {
    decompress = zlib.createGunzip();
  }
  return decompress ? res.pipe(decompress) : res;
}

function getParams(str) {
  var params = str.split(';').reduce(function (params, param) {
    var parts = param.split('=').map(function (part) { return part.trim(); });
    if (parts.length === 2) {
      params[parts[0]] = parts[1];
    }
    return params;
  }, {});
  return params;
}

function queryFeed(url, headers, maxItems) {
  headers = headers || {};
  maxItems = maxItems || 300;
  var errored = false;
  var defer = libQ.defer();
  var req = request(url)
  for (var h in headers) {
    req.setHeader(h, headers[h]);
  }

  var feedparser = new FeedParser();

  req.on('error', function (error) {
    errored = true;
    defer.reject(error);
  });

  req.on('response', function (res) {
    if (res.statusCode !== 200) {
      return this.emit('error', new Error('Bad status code'));
    }
    var encoding = res.headers['content-encoding'] || 'identity';
    var charset = getParams(res.headers['content-type'] || '').charset;
    res = maybeDecompress(res, encoding);
    res.pipe(feedparser);
  });

  feedparser.on('error', function (error) {
    errored = true;
    defer.reject(error);
  });

  var channel = {};
  feedparser.on('meta', function (meta) {
    channel.imageUrl = _.get(meta, 'image.url');
    if (!channel.imageUrl) {
      channel.imageUrl = _.get(meta, 'itunes:image.@.href');
    }
    channel.title = meta.title;
  });

  var items = [];
  feedparser.on('readable', function () {
    var stream = this;
    var meta = this.meta;

    var item;
    while (item = stream.read()) {
      if (items.length < maxItems && _.get(item, 'enclosures[0]')) {
        items.push(item);
      }
    }
  });

  feedparser.on('end', function() {
    if (!errored) {
      defer.resolve({channel: channel, items: items});
    }
  });

  return defer.promise;
}

module.exports = {
  query: queryFeed  
}
