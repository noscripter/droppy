/* eslint-disable space-before-keywords  */
"use strict";

var resources = {}, svgData = {}, minify, $;

var async        = require("async");
var etag         = require("etag");
var fs           = require("graceful-fs");
var jb           = require("json-buffer");
var mime         = require("mime-types").lookup;
var mkdirp       = require("mkdirp");
var path         = require("path");
var vm           = require("vm");
var zlib         = require("zlib");

var log          = require("./log");
var paths        = require("./paths.js").get();

var themesPath   = path.join(paths.mod, "/node_modules/codemirror/theme");
var modesPath    = path.join(paths.mod, "/node_modules/codemirror/mode");
var cachePath    = path.join(paths.mod, "dist", "cache.json");

var opts = {
  get uglify() {
    return {
      fromString: true,
      mangle: true,
      compress: {
        unsafe: true,
        screw_ie8: true,
        sequences: true,
        dead_code: true,
        conditionals: true,
        booleans: true,
        unused: true,
        if_return: true,
        join_vars: true,
      },
    };
  },
  get cleanCSS() {
    return {
      keepSpecialComments : 0,
      roundingPrecision: 3,
      rebase: false,
    };
  },
  get autoprefixer() {
    return {
      browsers: ["last 2 versions"],
      cascade: false,
    };
  },
  get htmlMinifier() {
    return {
      removeComments: true,
      collapseWhitespace: true,
      collapseBooleanAttributes: true,
      removeAttributeQuotes: true,
      removeOptionalTags: true,
      removeRedundantAttributes: true,
      caseSensitive: true,
      minifyCSS: {
        keepSpecialComments : 0,
        roundingPrecision: 3,
        rebase: false,
      },
    };
  }
};

var autoprefixer, cheerio, cleanCSS, postcss, uglify, htmlMinifier, templates;
try {
  autoprefixer = require("autoprefixer");
  cheerio      = require("cheerio");
  cleanCSS     = require("clean-css");
  postcss      = require("postcss");
  uglify       = require("uglify-js");
  htmlMinifier = require("html-minifier");
  templates    = require("./templates.js");
  cleanCSS = new cleanCSS(opts.cleanCSS);
} catch (e) {}

resources.files = {
  css: [
    "client/style.css",
    "client/sprites.css",
    "client/tooltips.css",
  ],
  js: [
    "node_modules/handlebars/dist/handlebars.runtime.min.js",
    "node_modules/jquery/dist/jquery.js",
    "node_modules/draggabilly/dist/draggabilly.pkgd.min.js",
    "node_modules/mousetrap/mousetrap.min.js",
    "node_modules/file-extension/file-extension.js",
    "node_modules/uppie/uppie.js",
    "node_modules/screenfull/dist/screenfull.js",
    "client/client.js",
  ],
  html: [
    "client/html/base.html",
    "client/html/auth.html",
    "client/html/main.html",
  ],
  other: [
    "client/images/logo.svg",
    "client/images/logo16.png",
    "client/images/logo32.png",
    "client/images/logo128.png",
    "client/images/logo152.png",
    "client/images/logo180.png",
    "client/images/logo192.png",
    "client/images/favicon.ico",
    "client/images/sprites.png",
  ]
};

// On-demand loadable libs. Will be available as ?!/lib/[prop]
var libs = {
  "vjs.js": "node_modules/video.js/dist/video.min.js",
  "vjs.css": "node_modules/video.js/dist/video-js.min.css",
  "vjs.swf": "node_modules/video.js/dist/video-js.swf",
  "cm.js": [
    "node_modules/codemirror/lib/codemirror.js",
    "node_modules/codemirror/mode/meta.js",
    "node_modules/codemirror/addon/dialog/dialog.js",
    "node_modules/codemirror/addon/selection/active-line.js",
    "node_modules/codemirror/addon/selection/mark-selection.js",
    "node_modules/codemirror/addon/search/searchcursor.js",
    "node_modules/codemirror/addon/edit/matchbrackets.js",
    "node_modules/codemirror/addon/search/search.js",
    "node_modules/codemirror/keymap/sublime.js"
  ],
  "cm.css": "node_modules/codemirror/lib/codemirror.css"
};

resources.load = function load(dev, cb) {
  minify = !dev;

  if (dev) return compile(false, cb);
  fs.readFile(cachePath, function(err, data) {
    if (err) {
      log.info(err.code, " ", cachePath, ", ", "building cache ...");
      return compile(true, cb);
    }
    try {
      cb(null, jb.parse(data));
    } catch (err) {
      log.error(err);
      compile(false, cb);
    }
  });
};

resources.build = function build(cb) {
  isCacheFresh(function(fresh) {
    if (fresh) {
      fs.readFile(cachePath, function(err, data) {
        if (err) return compile(true, cb);
        try {
          jb.parse(data);
          cb(null);
        } catch (err) {
          compile(true, cb);
        }
      });
    } else {
      minify = true;
      compile(true, cb);
    }
  });
};

function isCacheFresh(cb) {
  fs.stat(cachePath, function(err, stats) {
    if (err) return cb(false);
    var files = [];
    Object.keys(resources.files).forEach(function(type) {
      resources.files[type].forEach(function(file) {
        files.push(path.join(paths.mod, file));
      });
    });
    Object.keys(libs).forEach(function(file) {
      if (typeof libs[file] === "string") {
        files.push(path.join(paths.mod, libs[file]));
      } else {
        libs[file].forEach(function(file) {
          files.push(path.join(paths.mod, file));
        });
      }
    });
    async.map(files, function(file, cb) {
      fs.stat(file, function(err, stats) {
        cb(null, err ? 0 : stats.mtime.getTime());
      });
    }, function(_, times) {
      cb(stats.mtime.getTime() >= Math.max.apply(Math, times));
    });
  });
}

function compile(write, cb) {
  if (!autoprefixer) {
    return cb(new Error("Missing devDependencies to compile resource cache, " +
                        "please reinstall or run `npm install --only=dev` inside the project directory"));
  }
  async.series([compileAll, readThemes, readModes, readLibs], function(err, results) {
    if (err) return cb(err);
    var cache = {res: results[0], themes: {}, modes: {}, lib: {}};

    Object.keys(results[1]).forEach(function(theme) {
      cache.themes[theme] = {data: results[1][theme], etag: etag(results[1][theme]), mime: mime("css")};
    });

    Object.keys(results[2]).forEach(function(mode) {
      cache.modes[mode] = {data: results[2][mode], etag: etag(results[2][mode]), mime: mime("js")};
    });

    Object.keys(results[3]).forEach(function(file) {
      cache.lib[file] = {data: results[3][file], etag: etag(results[3][file]), mime: mime(path.basename(file))};
    });

    addGzip(cache, function(err, cache) {
      if (err) return cb(err);
      if (write) {
        mkdirp(path.dirname(cachePath), function(err) {
          if (err) return cb(err);
          fs.writeFile(cachePath, jb.stringify(cache), function(err) {
            cb(err, cache);
          });
        });
      } else cb(null, cache);
    });
  });
}

// Create gzip compressed data
function addGzip(cache, callback) {
  var types = Object.keys(cache), funcs = [];
  types.forEach(function(type) {
    funcs.push(function(cb) {
      gzipMap(cache[type], cb);
    });
  });
  async.parallel(funcs, function(err, results) {
    if (err) return callback(err);
    types.forEach(function(type, index) {
      cache[type] = results[index];
    });
    callback(null, cache);
  });
}

function gzipMap(map, callback) {
  var names = Object.keys(map), funcs = [];
  names.forEach(function(name) {
    funcs.push(function(cb) {
      gzip(map[name].data, cb);
    });
  });
  async.parallel(funcs, function(err, results) {
    if (err) return callback(err);
    names.forEach(function(name, index) {
      map[name].gzip = results[index];
    });
    callback(null, map);
  });
}

function gzip(data, callback) {
  zlib.gzip(data, function(err, gzipped) {
    if (err) return callback(err);
    callback(null, gzipped);
  });
}

function readThemes(callback) {
  var themes = {};
  fs.readdir(themesPath, function(err, filenames) {
    if (err) return callback(err);

    var files = filenames.map(function(name) {
      return path.join(themesPath, name);
    });

    async.map(files, fs.readFile, function(err, data) {
      if (err) return callback(err);

      filenames.forEach(function(name, index) {
        var css = String(data[index]);
        themes[name.replace(/\.css$/, "")] = new Buffer(minify ? cleanCSS.minify(css).styles : css);
      });

      // add our own theme
      fs.readFile(path.join(paths.mod, "/client/cmtheme.css"), function(err, css) {
        css = String(css);
        if (err) return callback(err);
        themes.droppy = new Buffer(minify ? cleanCSS.minify(css).styles : css);
        callback(null, themes);
      });
    });
  });
}

function readModes(callback) {
  var modes = {};

  // parse meta.js from CM for supported modes
  fs.readFile(path.join(paths.mod, "/node_modules/codemirror/mode/meta.js"), function(err, js) {
    if (err) return callback(err);

    // Extract modes from CodeMirror
    var sandbox = {CodeMirror : {}};
    vm.runInNewContext(js, sandbox);
    sandbox.CodeMirror.modeInfo.forEach(function(entry) {
      if (entry.mode !== "null") modes[entry.mode] = null;
    });

    async.map(Object.keys(modes), function(mode, cb) {
      fs.readFile(path.join(modesPath, mode, mode + ".js"), function(err, data) {
        cb(err, minify ? new Buffer(uglify.minify(String(data), opts.uglify).code) : data);
      });
    }, function(err, result) {
      Object.keys(modes).forEach(function(mode, i) {
        modes[mode] = result[i];
      });
      callback(err, modes);
    });
  });
}

function readLibs(callback) {
  var out = {};
  async.each(Object.keys(libs), function(dest, cb) {
    if (Array.isArray(libs[dest])) {
      async.map(libs[dest], function(p, innercb) {
        fs.readFile(path.join(paths.mod, p), innercb);
      }, function(err, data) {
        out[dest] = Buffer.concat(data);
        cb(err);
      });
    } else {
      fs.readFile(path.join(paths.mod, libs[dest]), function(err, data) {
        out[dest] = data;
        cb(err);
      });
    }
  }, function(err) {
    if (minify) {
      Object.keys(out).forEach(function(file) {
        if (/\.js$/.test(file)) {
          out[file] = new Buffer(uglify.minify(String(out[file]), opts.uglify).code);
        } else if (/\.css$/.test(file)) {
          out[file] = new Buffer(cleanCSS.minify(String(out[file])).styles);
        }
      });
    }
    callback(err, out);
  });
}

function readSVG() {
  fs.readdirSync(paths.svg).forEach(function(name) {
    var className = name.slice(0, name.length - ".svg".length);
    $ = cheerio.load(String(fs.readFileSync(path.join(paths.svg, name))), {xmlMode: true});
    $("svg").addClass(className);
    svgData[className] = $.html();
  });
}

function addSVG(html) {
  $ = cheerio.load(html);
  $("svg").each(function() {
    $(this).replaceWith(svgData[$(this).attr("class")]);
  });
  return $.html();
}

resources.compileJS = function compileJS() {
  var js = "";
  resources.files.js.forEach(function(file) {
    js += String(fs.readFileSync(path.join(paths.mod, file))) + ";";
  });

  // Add SVG object
  js = js.replace("/* {{ svg }} */", "droppy.svg = " + JSON.stringify(svgData) + ";");

  // Add Handlebars precompiled templates
  var temps = fs.readdirSync(paths.templates).map(function(p) {
    return path.join(paths.templates, p);
  });
  js = js.replace("/* {{ templates }} */", templates.compile(temps));

  // Minify
  if (minify) js = uglify.minify(js, opts.uglify).code;

  return {data: new Buffer(js), etag: etag(js), mime: mime("js")};
};

resources.compileCSS = function compileCSS() {
  var css = "";
  resources.files.css.forEach(function(file) {
    css += String(fs.readFileSync(path.join(paths.mod, file))) + "\n";
  });

  // Vendor prefixes
  css = postcss([autoprefixer]).process(css).css;

  // Minify
  if (minify) css = cleanCSS.minify(css).styles;

  return {data: new Buffer(css), etag: etag(css), mime: mime("css")};
};

resources.compileHTML = function compileHTML(res) {
  var html = {};
  var min = function min(html) {
    return minify ? htmlMinifier.minify(html, opts.htmlMinifier) : html;
  };

  resources.files.html.forEach(function(file) {
    html[path.basename(file)] = addSVG(String(fs.readFileSync(path.join(paths.mod, file))));
  });

  // Combine pages
  $ = cheerio.load(html["base.html"]);
  $("html").attr("data-type", "main");
  var main = min($("#page").replaceWith(html["main.html"]).end().html());
  res["main.html"] = {data: new Buffer(main), etag: etag(main), mime: mime("html")};

  $ = cheerio.load(html["base.html"]);
  $("html").attr("data-type", "auth");
  var auth = min($("#page").replaceWith(html["auth.html"]).end().html());
  res["auth.html"] = {data: new Buffer(auth), etag: etag(auth), mime: mime("html")};

  $ = cheerio.load(html["base.html"]);
  $("html").attr("data-type", "firstrun");
  var firstrun = min($("#page").replaceWith(html["auth.html"]).end().html());
  res["firstrun.html"] = {data: new Buffer(firstrun), etag: etag(firstrun), mime: mime("html")};

  return res;
};

function compileAll(callback) {
  var res = {};

  readSVG();
  res["client.js"] = resources.compileJS();
  res["style.css"] = resources.compileCSS();
  res = resources.compileHTML(res);

  // Read misc files
  resources.files.other.forEach(function(file) {
    var data;
    var name = path.basename(file);
    var fullPath = path.join(paths.mod, file);

    try {
      data = fs.readFileSync(fullPath);
    } catch (err) {
      callback(err);
    }

    res[name] = {data: data, etag: etag(data), mime: mime(name)};
  });
  callback(null, res);
}

module.exports = resources;
