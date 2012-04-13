var CBrowse = Base.extend({
  defaults: {
    urlParamTemplate : 'r=CHR:START-END', // Overwrite this for your URL style
    width            : 1000,
    height           : 200,
    labelWidth       : 134,
    buffer           : 1,
    longestLabel     : 30,
    trackSpacing     : 2,
    tracks           : [],
    colors           : {
      background     : '#FFFFFF',
      majorScaleLine : '#CCCCCC',
      minorScaleLine : '#E5E5E5',
      sortHandle     : '#CFD4E7'
    }
  },
  
  constructor: function (config) {
    if (!this.supported()) {
      this.die('Your browser does not support this functionality');
    }
    
    $.extend(this, this.defaults, config);
    
    if (!(this.container && this.container.length)) {
      this.die('You must supply a ' + (this.container ? 'valid ' : '') + 'container element');
    }
    
    this.init();
  },

  init: function () {
    var cBrowse = this;
    var width   = this.width;
    
    this.history        = {};
    this.prev           = {};
    this.backgrounds    = {};
    this.wrapperLeft    = this.labelWidth - width;
    this.width         -= this.labelWidth;
    this.fullWidth      = this.width * (2 * this.buffer + 1);
    this.paramRegex     = new RegExp('([?&;])' + this.urlParamTemplate.replace(/^(\w+)=/, '($1)=').replace(/CHR(.)/, '(\\w+)($1)').replace(/START(.)/, '(\\d+)($1)').replace('END', '(\\d+)') + '([;&])');
    this.menuContainer  = $('<div class="menu_container">').css({ width: width - this.labelWidth - 1, left: this.labelWidth + 1 }).appendTo(this.container);
    this.labelContainer = $('<ul class="label_container">').width(this.labelWidth).appendTo(this.container).sortable({
      axis        : 'y',
      helper      : 'clone',
      placeholder : 'label',
      start       : function (e, ui) {
        ui.placeholder.css({ height: ui.item.height(), visibility: 'visible', background: cBrowse.colors.sortHandle }).html(ui.item.html());
        ui.helper.hide();
      },
      update      : function (e, ui) {
        cBrowse.tracks[ui.item.data('index')].container[ui.item[0].previousSibling ? 'insertAfter' : 'insertBefore'](cBrowse.tracks[$(ui.item[0].previousSibling || ui.item[0].nextSibling).data('index')].container);
      }
    });
    
    this.wrapper = $('<div class="wrapper">').appendTo(this.container);
    
    this.container.width(width).on({
      mousedown: function (e) {
        if (!e.which || e.which === 1) {  // Only scroll on left click
          cBrowse.mousedown(e);
        }
        
        return false;
      },
      mousewheel: function (e, delta) {
        clearTimeout(cBrowse.zoomDeltaTimeout);
        clearTimeout(cBrowse.zoomTimeout);
        
        cBrowse.zoomDeltaTimeout = setTimeout(function () {
          if (delta > 0) {
            cBrowse.zoomInHighlight.css({ left: e.pageX - 20, top: e.pageY - 20, display: 'block' }).animate({
              width: 80, height: 80, top: '-=20', left: '-=20'
            }, {
              complete: function () { $(this).css({ width: 40, height: 40, display: 'none' }); }
            });
          } else {
            cBrowse.zoomOutHighlight.css({ left: e.pageX - 20, top: e.pageY - 20, display: 'block' }).animate({
              width: 40, height: 40, top: '+=10', left: '+=10'
            }, {
              complete: function () { $(this).css({ width: 80, height:80, display: 'none' }); }
            });
          }
        }, 100);
        
        cBrowse.zoomTimeout = setTimeout(function () {
          cBrowse[delta > 0 ? 'zoomIn' : 'zoomOut'](e.pageX - cBrowse.container.offset().left - cBrowse.labelWidth);
        }, 300);
        
        return false;
      }
    }, '.image_container, .overlay');
    
    $(document).on('mouseup', function (e) {
      if (cBrowse.dragging) {
        cBrowse.mouseup(e);
      }
    });
    
    window.onpopstate = function (e) {
      if (e.state !== null) {
        cBrowse.popState(e.state);
      }
    };
    
    var coords = (window.location.search + '&').match(this.paramRegex);
    
    this.chromosome = coords[3];
    
    this.setRange(coords[5], coords[7], false);
    this.setHistory('replaceState');
    this.setTracks();
    this.makeImage();
    
    this.zoomInHighlight = $([
      '<div class="canvas_zoom i">',
        '<div class="t l h"></div>',
        '<div class="t r h"></div>',
        '<div class="t l v"></div>',
        '<div class="t r v"></div>',
        '<div class="b l h"></div>',
        '<div class="b r h"></div>',
        '<div class="b l v"></div>',
        '<div class="b r v"></div>',
      '</div>'
    ].join('')).appendTo('body');
    
    this.zoomOutHighlight = this.zoomInHighlight.clone().toggleClass('i o').appendTo('body');
  },
  
  reset: function () {
    var i = this.tracks.length;
    
    while (i--) {
      this.tracks[i].reset();
    }
    
    this.scale   = 9e99; // arbitrary value so that setScale resets track scales as well
    this.history = {};
    
    this.setRange(this.start, this.end, false);
    this.makeImage();
  },
  
  mousedown: function (e) {
    var cBrowse = this;
    
    this.dragging   = true;
    this.prev.left  = this.left;
    this.dragOffset = e.pageX - this.left;
    this.dragStart  = this.start;
    this.dragEvent  = function (e2) { cBrowse.mousemove(e2); };
    
    $(document).on('mousemove', this.dragEvent);
  },
  
  mouseup: function (e, update) {
    this.dragging = false;
    
    $(document).off('mousemove', this.dragEvent);
    
    $('.overlay', this.wrapper).css({
      left       : function (i, left) { return parseInt(left, 10) + parseInt($(this).css('marginLeft'), 10); },
      marginLeft : 0
    });
    
    if (this.left !== this.prev.left && update !== false) {
      this.updateURL();
    }
    
    if (update !== false) {
      this.checkTrackSize();
    }
  },
  
  mousemove: function (e) {
    var start, end;
    
    this.left = e.pageX - this.dragOffset;
    
    if (this.left < this.minLeft) {
      this.prev.left = this.left;
      this.left      = this.minLeft;
      
      start = this.chromosomeSize - this.length + 1;
      end   = this.chromosomeSize;
    } else if (this.left > this.maxLeft) {
      this.prev.left = this.left;
      this.left      = this.maxLeft;
      
      start = 1;
      end   = this.length;
    } else {
      start = this.dragStart - (this.left - this.prev.left) / this.scale;
      end   = start + this.length - 1;
    }
    
    $('.track_container', this.container).css('left', this.left);
    $('.overlay', this.wrapper).css('marginLeft', this.left - this.prev.left);
    
    this.setRange(start, end, false);
    
    if (this.redraw()) {
      this.mouseup(e, false);
      this.mousedown(e);
    }
  },
  
  checkTrackSize: function () {
    var bounds = { x: this.scaledStart, w: this.width, y: 0 };
    var scale  = this.scale;
    var height;
    
    for (var i = 0; i < this.tracks.length; i++) {
      if (!this.tracks[i].fixedHeight) {
        if (!this.dragging) {
          bounds.h = this.tracks[i].heights.max;
          height   = this.tracks[i].separateLabels ?
            Math.max.apply(Math, $.map(this.tracks[i].labelPositions.search(bounds),   function (feature) { return feature.labelBottom[scale]; }).concat(0)) + this.tracks[i].heights.maxFeatures :
            Math.max.apply(Math, $.map(this.tracks[i].featurePositions.search(bounds), function (feature) { return feature.bottom[scale];      }).concat(0));
          
          if (this.tracks[i].autoHeight) {
            this.tracks[i].resize(height);
          }
          
          this.tracks[i].sizeHandle.data('height', height);
        }
      }
    }
  },
  
  zoomIn: function (x) {
    if (!x) {
      x = this.width / 2;
    }
    
    var start = Math.round(this.start + x / (2 * this.scale));
    var end   = Math.round(start + (this.length - 1) / 2);
    
    this.setRange(start, end);
  },
  
  zoomOut: function (x) {
    if (!x) {
      x = this.width / 2;
    }
    
    var start = Math.round(this.start - x / this.scale);
    var end   = Math.round(start + 2 * (this.length - 1));
    
    if (start < 1) {
      start = 1;
    }
    
    if (end > this.chromosomeSize) {
      end = this.chromosomeSize;
    }
    
    this.abortAjax();
    this.setRange(start, end);
  },
  
  redraw: function () {
    if ((this.left > 0 && this.left < this.offsets.right) || (this.left < 0 && Math.abs(this.left) < Math.abs(this.offsets.left + this.wrapperLeft))) {
      return false;
    }
    
    this.makeImage();
    
    return true;
  },
  
  setRange: function (start, end, update) {
    this.prev.start = this.start;
    this.prev.end   = this.end;
    this.start      = typeof start === 'number' ? Math.round(start) : parseInt(start, 10);
    this.end        = typeof end   === 'number' ? Math.round(end)   : parseInt(end,   10);
    
    if (this.start < 1) {
      this.start = 1;
    }
    
    if (this.end > this.chromosomeSize) {
      this.end = this.chromosomeSize;
    }
    
    if (this.end === this.start) {
      this.end++;
    }
    
    this.length = this.end - this.start + 1;
    
    this.setScale();
    
    if (update !== false && (this.prev.start !== this.start || this.prev.end !== this.end)) {
      this.updateURL();
    }
  },
  
  setScale: function () {
    this.prev.scale  = this.scale;
    this.scale       = this.width / this.length;
    this.scaledStart = this.start * this.scale;
    
    if (this.prev.scale !== this.scale) {
      this.edges       = { start: 9e99, end: -9e99 };
      this.offsets     = { right: this.width, left: -this.width };
      this.left        = 0;
      this.prev.left   = 0;
      this.minLeft     = Math.round((this.end   - this.chromosomeSize) * this.scale);
      this.maxLeft     = Math.round((this.start - 1) * this.scale);
      this.scrollStart = 'ss_' + this.start + '_' + this.end;
      
      if (this.prev.scale) {
        var i = this.tracks.length;
        
        this.menuContainer.children().hide();
        
        while (i--) {
          this.tracks[i].setScale();
        }
        
        if (this.backgrounds) {
          for (var c in this.backgrounds) {
            i = this.backgrounds[c].length;
            
            while (i--) {
              this.backgrounds[c][i].scaledStart = this.backgrounds[c][i].start * this.scale;
              this.backgrounds[c][i].scaledEnd   = this.backgrounds[c][i].end   * this.scale;
            }
          }
        }
      }
    }
  },
  
  setTracks: function () {
    var defaults = {
      cBrowse         : this,
      canvasContainer : this.wrapper,
      paramRegex      : this.paramRegex,
      width           : this.width
    };
    
    for (var i = 0; i < this.tracks.length; i++) {
      if (this.tracks[i].type) {
        this.tracks[i] = new CBrowse.Track[this.tracks[i].type]($.extend(this.tracks[i], defaults, { index: i }));
      } else {
        this.tracks[i] = new CBrowse.Track($.extend(this.tracks[i], defaults, { index: i }));
      }
    }
  },
  
  makeImage: function () {
    var cBrowse = this;
    var left    = -this.left;
    var dir     = left < 0 ? 'right' : 'left';
    var start, end;
    
    if (left) {
      start = left > 0 ? this.edges.end   : this.edges.start - (this.buffer * this.length);
      end   = left < 0 ? this.edges.start : this.edges.end   + (this.buffer * this.length);
    } else {
      start = this.start - this.length;
      end   = this.end   + this.length;
    }
    
    var width = Math.round((end - start) * this.scale);
    
    this.edges.start  = Math.min(start, this.edges.start);
    this.edges.end    = Math.max(end,   this.edges.end);
    this.offsets[dir] = this.tracks[0].offsets[dir] + width;
    
    if (this.updateFromHistory()) {
      return;
    }
    
    var edges   = $.extend({}, this.edges);
    var offsets = $.extend({}, this.offsets);
    var overlay = $('<div class="overlay">').prependTo(this.wrapper).css(dir, left ? width - (Math.abs(left) % width) : 0).width(width);
    var cls     = this.scrollStart;
    
    $.when.apply($, $.map(this.tracks, function (track) { return track.makeImage(start, end, width, left, cls); })).done(function () {
      $.when.apply($, $($.map(arguments, function (a) { return a.target; })).show().map(function () {
        return $(this).data('img').drawBackground();
      })).done(function () {
        overlay.remove();
        overlay = null;
      });
      
      cBrowse.prev.history = cBrowse.start + '-' + cBrowse.end;
      
      cBrowse.checkTrackSize();
      cBrowse.setHistory(false, edges, offsets);
    }).fail(function () {
      overlay.remove();
      overlay = null;
    });
  },
  
  updateURL: function (redraw) {
    this.setHistory();
    
    if (redraw !== false) {
      this.redraw();
    }
  },
  
  setHistory: function (action, edges, offsets) {
    if (action !== false) {
      if (this.prev.location === this.start + '-' + this.end) {
        return;
      }
      
      this.prev.location = this.start + '-' + this.end;
    
      window.history[action || 'pushState']({}, '', this.getQueryString());
    }
    
    if (this.prev.history) {
      this.history[this.start + '-' + this.end] = {
        left    : this.left,
        images  : this.scrollStart,
        edges   : edges   || this.history[this.prev.history].edges,
        offsets : offsets || this.history[this.prev.history].offsets
      };
    }
  },
  
  popState: function () {
    var coords = (window.location.search + '&').match(this.paramRegex);
    
    if (coords.length) {
      this.setRange(coords[5], coords[7], false);
      
      if (!this.updateFromHistory()) {
        this.reset();
      }
    }
  },
  
  updateFromHistory: function () {
    var history = this.history[this.start + '-' + this.end];
    
    if (history) {
      var images = $('.track_container .' + history.images, this.container);
      
      if (images.length) {
        $('.track_container', this.container).css('left', history.left).children().hide();
        
        this.left    = history.left;
        this.edges   = history.edges;
        this.offsets = history.offsets;
        
        this.checkTrackSize();
        
        images.show();
        images = null;
        
        return true;
      }
    }
    
    return false;
  },
  
  abortAjax: function () {
    var i = this.tracks.length;
    
    while (i--) {
      if (this.tracks[i].ajax) {
        this.tracks[i].ajax.abort();
      }
    }
  },
  
  getQueryString: function () {
    return (window.location.search + '&').replace(this.paramRegex, '$1$2=$3$4' + this.start + '$6' + this.end + '$8').slice(0, -1);
  },
  
  supported: function () {
    var elem = document.createElement('canvas');
    return !!(elem.getContext && elem.getContext('2d') && typeof window.history.pushState === 'function');
  },
  
  die: function (error) {
    alert(error);
    throw(error);
  },
  
  makeMenu: $.noop // implement in plugin
});
