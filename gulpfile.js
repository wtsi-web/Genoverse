'use strict';

var gulp = require('gulp');
var runSequence = require('run-sequence');
var del = require('del');
var browserSync = require('browser-sync');
var gulpLoadPlugins = require('gulp-load-plugins');

var $ = gulpLoadPlugins();
var reload = browserSync.reload;


// Copy all files at the root level to dest folder
gulp.task('copy', function() {
  gulp.src(['index.html', 'index.js'], { dot: true})
    .pipe(gulp.dest('dist'))
    .pipe($.size({title: 'copy'}))
});

// Compile and automatically prefix stylesheets
gulp.task('styles', function () {
  var AUTOPREFIXER_BROWSERS = [
    'ie >= 10',
    'ie_mob >= 10',
    'ff >= 30',
    'chrome >= 34',
    'safari >= 7',
    'opera >= 23',
    'ios >= 7',
    'android >= 4.4',
    'bb >= 10'
  ];

  // For best performance, don't add Sass partials to `gulp.src`
  return gulp.src(['css/**/*.scss', 'css/**/*.css'])
    .pipe($.newer('.tmp/styles'))
    .pipe($.sourcemaps.init())
    .pipe($.sass({
      precision: 10
    }).on('error', $.sass.logError))
    .pipe($.autoprefixer(AUTOPREFIXER_BROWSERS))
    .pipe(gulp.dest('.tmp/styles'))
    // Concatenate and minify styles
    .pipe($.if('*.css', $.cssnano()))
    .pipe($.size({title: 'styles'}))
    .pipe($.sourcemaps.write('./'))
    .pipe(gulp.dest('dist/styles'))
    .pipe(gulp.dest('.tmp/styles'));
});

// Concatenate and minify JavaScript. Optionally transpiles ES2015 code to ES5.
// to enable ES2015 support remove the line `"only": "gulpfile.babel.js",` in the
// `.babelrc` file.
gulp.task('scripts', function () {
  gulp.src([
    // We explicitly list scripts in the right order to be concatenated;
    // Alternatively, we can use 'useref' to automatically list them.
    'js/**/*.js',
    '!js/genoverse.min.js'
  ])
    .pipe($.newer('.tmp/scripts'))
    .pipe($.sourcemaps.init())
    .pipe($.sourcemaps.write())
    .pipe(gulp.dest('.tmp/scripts'))
    .pipe($.concat('genoverse.min.js'))
    .pipe($.uglify().on('error', function(e) {
      console.log(e);
    }))
    // Output files
    .pipe($.size({title: 'scripts'}))
    .pipe($.sourcemaps.write('.'))
    .pipe(gulp.dest('dist/scripts'))
    .pipe(gulp.dest('.tmp/scripts'))
});

// Clean output directory
gulp.task('clean', function () { del(['.tmp', 'dist/*', '!dist/.git'], {dot: true}) });

// Watch files for changes & reload
gulp.task('serve', ['copy', 'scripts', 'styles'], function () {
  browserSync({
    notify: false,
    // Customize the Browsersync console logging prefix
    logPrefix: 'WSK',
    // Allow scroll syncing across breakpoints
    scrollElementMapping: ['main', '.mdl-layout'],
    // Run as an https by uncommenting 'https: true'
    // Note: this uses an unsigned certificate which on first access
    //       will present a certificate warning in the browser.
    // https: true,
    server: ['.tmp', 'app'],
    port: 3000
  });

  gulp.watch(['index.html'], reload);
  gulp.watch(['css/**/*.{scss,css}'], ['styles', reload]);
  gulp.watch(['js/**/*.js'], ['scripts', reload]);
  gulp.watch(['i/**/*'], reload);
});

// Build and serve the output from the dist build
gulp.task('serve:dist', ['default'], function () {
  browserSync({
    notify: false,
    logPrefix: 'WSK',
    // Allow scroll syncing across breakpoints
    scrollElementMapping: ['main', '.mdl-layout'],
    // Run as an https by uncommenting 'https: true'
    // Note: this uses an unsigned certificate which on first access
    //       will present a certificate warning in the browser.
    // https: true,
    server: 'dist',
    port: 3001
  })}
);

// Build production files, the default task
gulp.task('default', ['clean'], function(cb) {
  runSequence(
    'styles',
    ['scripts', 'copy'],
    cb
  )
});
