if(!window.templates)window.templates={};const __tmplt=window.templates;__tmplt["undefined/PlayerPic.sf"]="<img class=\"lazy-img\" :src=\"{{src}}\" alt=\"\">";
class PlayerPic{
	// pictures = '';
	src = '';
	// crop = [];

	m2v$src(now){
		if(this.src === now)
			return;

		this.$el('img').removeClass('lazy-img-loaded');
	}

	constructor(options){
		if(options === void 0)
			return;

		this.pictures = options.pictures;
		this.crop = JSON.parse(`[${options.crop}]`);
	}

	init(){
		var imgEl = this.$el('img')[0];
		if(this.src === this.pictures)
			return;

		this.src = this.pictures || '';

		var that = this;
		imgEl.onload = imgEl.onerror = function(){
			Crop(imgEl, that.crop);
			$(imgEl).addClass('lazy-img-loaded');
		}
	}

	reinit(){
		this.init();
	}
}

sf.component('player-pic', {template:'./PlayerPic.sf'});
__tmplt["undefined/PagePagination.sf"]="<div>\n  <ul>\n    <li style=\"{{index !== 0 ? '' : 'display: none'}}\">\n      <a @click=\"changePage('first')\">First</a>\n    </li>\n    <li style=\"{{index > 0 ? '' : 'display: none'}}\">\n      <a @click=\"changePage(index-1)\">Previous</a>\n    </li>\n    <li style=\"float: right; {{index !== total-1 ? '' : 'display: none'}}\">\n      <a @click=\"changePage('last')\">Last</a>\n    </li>\n    <li style=\"float: right; {{index < total-1 ? '' : 'display: none'}}\">\n      <a @click=\"changePage(index+1)\">Next</a>\n    </li>\n  </ul>\n  <ul>\n    <li sf-each=\"x in showed\">\n      <a @click=\"changePage(x)\" class=\"{{index === x ? 'selected' : ''}}\">{{x+1}}</a>\n    </li>\n  </ul>\n</div>";
class PagePagination{
  list = [];
  showed = [];
  index = 0;
  total = 0;

  events = {
    change: NOOP
  };

  constructor(options){
    Object.assign(this, options);
  }

  changeTotal(now){
    if(this.list.length > now){
      this.list.length = now;
      this.showed = this.list;
      return;
    }

    this.total = now;

    var i = this.list.length;
    this.list.length = now;

    for (; i < now; i++)
      this.list[i] = i;

    this.showed = this.list;
  }

  changePage(index){
    if(index === 'first')
      index = 0;
    else if(index === 'last')
      index = this.total-1;

    if(index >= this.total || index < 0)
      return;

    this.index = index;
    this.events.change(index);
  }
}

sf.component('page-pagination', {template:'./PagePagination.sf'});
__tmplt["undefined/SmallNotif.sf"]="<sf-m name=\"small.notif\">\n  <div class=\"notify-container right-top\">\n    <div sf-each=\"x in list\" class=\"notify-base notify-{{x.color}}\">\n      <span>{{x.message}}</span>\n      <button @click=\"close(x)\" class=\"close\">×</button>\n    </div>\n  </div>\n</sf-m>";
var SmallNotif = sf.model('small.notif', function(My){
  const $ = sf.dom;

	My.list = [];
	My.on$list = {
		create(el){
			$(el).animateKey('fadeInUp');
		},
		remove(el, remove){
			$(el).animateKey('fadeOutUp', remove);
			setTimeout(remove, 500); // To make sure it's removed
			return true;
		}
	};

	My.add = function(message, color, delay){
		var item = {message, color:color || 'yellow'};
		My.list.push(item);

		setTimeout(()=> {
			My.list.splice(My.list.indexOf(item), 1);
		}, delay || 5000);
	}

	My.close = function(item){
		My.list.splice(My.list.indexOf(item), 1);
	}
});
__tmplt["undefined/HSlider.sf"]="<div class=\"bar\" @pointerdown=\"drag(event)\">\n  <div class=\"buffer-bar\">\n    <div sf-each=\"v in buffered\" class=\"buffer\"\n      style=\"transform: translateX({{v.x}}px) scaleX({{v.scale}})\"\n    ></div>\n  </div>\n  <div class=\"played-bar\" style=\"transform: scaleX({{playTime}})\"></div>\n</div>\n<div class=\"played-circle\" @pointerdown=\"drag()\" style=\"transform: translateX({{circlePos}}px)\"></div>";
class PlayerHSlider{
	buffered = [];
	playTime = 0;
	circlePos = 0;
	events = {};

	barRect = null;
	isDragging = false;

	constructor(options){
		Object.assign(this, options);
	}

	init(){
		this.barRect = this.$el('.bar')[0].getBoundingClientRect();
	}

	seek(percent){
		this.playTime = percent;

		if(this.isDragging || !this.barRect)
			return;

		this.circlePos = percent * this.barRect.width;
	}

	drag(ev){
		var bar = this.$el('.bar')[0].getBoundingClientRect();

		var that = this;
		function dragging(ev){
			if(ev.clientX < bar.left || ev.clientX > bar.right)
				return;

			var pos = ev.clientX - bar.left;
			that.circlePos = pos;
		}

		that.isDragging = true;

		ev && dragging(ev);

		$(document).on('pointermove', dragging).once('pointerup', function(){
			that.playTime = that.circlePos / bar.width;
			that.isDragging = false;
			that.events.changed && that.events.changed();
			$(document).off('pointermove', dragging);
		});
	}
}

sf.component('player-h-slider', {template: './HSlider.sf'});
//# sourceMappingURL=generated.js.map