/*! For license information please see main.js.LICENSE.txt */
(()=>{"use strict";var e={"../common/Settings.ts":(e,t,a)=>{a.r(t),a.d(t,{default:()=>SETTINGS});class SETTINGS{static init(e){this.MOD_NAME=e,String.prototype.localize||(String.prototype.localize=function(){return game.i18n.localize(this.valueOf())})}static register(e,t){game.settings.register(SETTINGS.MOD_NAME,e,t)}static registerMenu(e,t){game.settings.registerMenu(SETTINGS.MOD_NAME,e,t)}static get(e){return game.settings.get(SETTINGS.MOD_NAME,e)}static async set(e,t){return await game.settings.set(SETTINGS.MOD_NAME,e,t)}static default(e){return game.settings.settings.get(SETTINGS.MOD_NAME+"."+e).default}static typeOf(){return Object}}},"./src/AngleSnaps.ts":(e,t,a)=>{a.r(t),a.d(t,{default:()=>AngleSnaps});var i=a("../common/Settings.ts");class AngleSnaps{static init(){i.default.register("angle-snap-macro",{config:!0,scope:"world",name:"DF_TEMPLATES.AngleSnap.MacroName",hint:"DF_TEMPLATES.AngleSnap.MacroHint",type:Number,range:{min:4,max:24,step:4},default:24}),i.default.register("angle-snap-micro",{config:!0,scope:"world",name:"DF_TEMPLATES.AngleSnap.MicroName",hint:"DF_TEMPLATES.AngleSnap.MicroHint",type:Number,range:{min:1,max:4,step:1},default:3})}static ready(){libWrapper.register(i.default.MOD_NAME,"canvas.templates._onMouseWheel",(function(e){const t=this.hover;if(!t)return;let a=360/i.default.get("angle-snap-macro");e.shiftKey||(a/=i.default.get("angle-snap-micro"));const n=Math.sign(e.deltaY),r=a*n;let o=t.document.direction-t.document.direction%a;return t.document.direction%a!=0&&n<0&&(o+=a),t.rotate(o+r,a)}),"OVERRIDE")}static handleDnD5eAbilityTemplate(e){e.ctrlKey&&e.preventDefault(),e.stopPropagation();let t=360/i.default.get("angle-snap-macro");e.shiftKey&&(t/=i.default.get("angle-snap-micro"));const a=Math.sign(e.deltaY);let n=this.document.direction;n<0&&(n+=360),n-=n%t,this.document.direction%t!=0&&a<0&&(n+=t),this.document.updateSource({direction:n+t*a}),this.refresh()}}},"./src/LineToBoxCollision.ts":(e,t,a)=>{var i;a.r(t),a.d(t,{default:()=>LineToBoxCollision}),function(e){e[e.INSIDE=0]="INSIDE",e[e.LEFT=1]="LEFT",e[e.RIGHT=16]="RIGHT",e[e.BOTTOM=256]="BOTTOM",e[e.TOP=4096]="TOP"}(i||(i={}));class LineToBoxCollision{static _computeOutCode(e,t,a){let n;return n=i.INSIDE,e<=a.left?n|=i.LEFT:e>=a.right&&(n|=i.RIGHT),t<=a.top?n|=i.BOTTOM:t>=a.bottom&&(n|=i.TOP),n}static cohenSutherlandLineClipAndDraw(e,t,a,n,r){let o=this._computeOutCode(e,t,r),s=this._computeOutCode(a,n,r),l=!1;for(;;){if(!(o|s)){l=!0;break}if(o&s)break;{let[l,c]=[0,0];const g=s>o?s:o;g&i.TOP?(l=e+(a-e)*(r.bottom-t)/(n-t),c=r.bottom-1):g&i.BOTTOM?(l=e+(a-e)*(r.top-t)/(n-t),c=r.top+1):g&i.RIGHT?(c=t+(n-t)*(r.right-e)/(a-e),l=r.right-1):g&i.LEFT&&(c=t+(n-t)*(r.left-e)/(a-e),l=r.left+1),g==o?(e=l,t=c,o=this._computeOutCode(e,t,r)):(a=l,n=c,s=this._computeOutCode(a,n,r))}}return l}}},"./src/SnapIntersect.ts":(e,t,a)=>{a.r(t),a.d(t,{default:()=>SnapIntersect});var i=a("../common/Settings.ts");class SnapIntersect{static init(){i.default.register("SnapIntersect",{config:!0,scope:"world",name:"DF_TEMPLATES.SnapIntersectName",hint:"DF_TEMPLATES.SnapIntersectHint",type:Boolean,default:!1,onChange:e=>e?this.patch():this.unpatch()})}static ready(){i.default.get("SnapIntersect")&&this.patch()}static patch(){libWrapper.register(i.default.MOD_NAME,"canvas.templates.gridPrecision",SnapIntersect.TemplateLayer_gridPrecision,"OVERRIDE")}static unpatch(){libWrapper.unregister(i.default.MOD_NAME,"canvas.templates.gridPrecision",!1)}static TemplateLayer_gridPrecision(){return canvas.grid.type===CONST.GRID_TYPES.GRIDLESS?0:1}static handleDnD5eAbilityTemplate(e){const t=Date.now();if(t-this._moveTime<=20)return;const a=e.data.getLocalPosition(this.layer),n=canvas.grid.getSnappedPosition(a.x,a.y,i.default.get("SnapIntersect")?1:2);this.document.updateSource({x:n.x,y:n.y}),this.refresh(),this._moveTime=t}}},"./src/SquareTemplate.ts":(e,t,a)=>{a.r(t),a.d(t,{default:()=>SquareTemplate});var i=a("../common/Settings.ts");class SquareTemplate{static init(){i.default.register(SquareTemplate.FIX_ROTATION_PREF,{config:!0,scope:"world",name:"DF_TEMPLATES.SquareRotateName",hint:"DF_TEMPLATES.SquareRotateHint",type:Boolean,default:!0,onChange:e=>e?SquareTemplate.patch():SquareTemplate.unpatch()}),i.default.get(SquareTemplate.FIX_ROTATION_PREF)&&SquareTemplate.patch()}static patch(){libWrapper.register(i.default.MOD_NAME,"MeasuredTemplate.prototype._getRectShape",SquareTemplate.MeasuredTemplate_getRectShape,"OVERRIDE"),libWrapper.register(i.default.MOD_NAME,"MeasuredTemplate.prototype._refreshRulerText",SquareTemplate.MeasuredTemplate_refreshRulerText,"WRAPPER")}static unpatch(){libWrapper.unregister(i.default.MOD_NAME,"MeasuredTemplate.prototype._getRectShape",!1),libWrapper.unregister(i.default.MOD_NAME,"MeasuredTemplate.prototype._refreshRulerText",!1)}static MeasuredTemplate_getRectShape(e,t,a=!1){const i=PIXI.Matrix.IDENTITY.rotate(Math.PI/180*-45+e),n=a?1e-4:0,r=Math.sqrt(t*t/2)-n,o=i.apply(new PIXI.Point(n,n)),s=i.apply(new PIXI.Point(r,n)),l=i.apply(new PIXI.Point(n,r)),c=i.apply(new PIXI.Point(r,r)),g=new PIXI.Polygon([o.x,o.y,s.x,s.y,c.x,c.y,l.x,l.y,o.x,o.y]);return g.x=o.x,g.y=o.y,g.width=r,g.height=r,g}static MeasuredTemplate_refreshRulerText(e){if(e(),"rect"===this.document.t){const e=`${Math.sqrt(this.document.distance*this.document.distance/2).toFixed(1)}${canvas.scene.grid.units}`;this.ruler.text=e}}}SquareTemplate.FIX_ROTATION_PREF="fix-square-rotation"},"./src/TemplateConfig.ts":(e,t,a)=>{a.r(t),a.d(t,{HighlightMode:()=>i,TemplateConfig:()=>TemplateConfig});var i,n=a("../common/Settings.ts");!function(e){e.CENTER="center",e.TOUCH="touch",e.POINTS="points"}(i||(i={}));class TemplateConfig extends FormApplication{static get options(){var e;if(!this._options){const t=(null!==(e=game.i18n.translations.DF_TEMPLATES)&&void 0!==e?e:game.i18n._fallback.DF_TEMPLATES).TemplateConfig.Options;this._options=Object.keys(t).map((e=>(t[e].type=e,t[e])))}return this._options}static get defaultOptions(){return mergeObject(super.defaultOptions,{resizable:!1,submitOnChange:!1,closeOnSubmit:!0,editable:!0,submitOnClose:!1,width:500,popOut:!0,minimizable:!1,title:"DF_TEMPLATES.TemplateConfig.Title",template:"modules/df-templates/templates/template-config.hbs"})}static get config(){return n.default.get(this.CONFIG_PREF)}static get isNotDefault(){const e=this.config;return e.circle!==i.CENTER||e.cone!==i.CENTER||e.rect!==i.CENTER||e.ray!==i.CENTER}static init(){n.default.register(this.PATCH_5E_PREF,{config:!1,type:Boolean,default:!1,scope:"world"}),n.default.register(this.PATCH_5E_CIRCLE_PREF,{config:!1,type:Boolean,default:!1,scope:"world"});const e=n.default.get(this.PATCH_5E_PREF),t=n.default.get(this.PATCH_5E_CIRCLE_PREF);n.default.register(this.CONFIG_PREF,{config:!1,scope:"world",type:Object,default:{circle:t?i.TOUCH:i.CENTER,cone:e?i.TOUCH:i.CENTER,rect:e?i.TOUCH:i.CENTER,ray:e?i.TOUCH:i.CENTER},onChange:()=>{var e;return null===(e=canvas.templates)||void 0===e?void 0:e.placeables.filter((e=>"circle"===e.document.t)).forEach((e=>e.draw()))}}),n.default.registerMenu("template-config",{restricted:!0,type:TemplateConfig,label:"DF_TEMPLATES.TemplateConfig.Title"})}getData(e){return mergeObject(TemplateConfig.config,{options:TemplateConfig.options})}activateListeners(e){e.find("#dfte-set-foundry").on("click",(t=>{t.preventDefault(),e.find('select[name="circle"]').val(i.CENTER),e.find('select[name="cone"]').val(i.CENTER),e.find('select[name="rect"]').val(i.CENTER),e.find('select[name="ray"]').val(i.CENTER)})),e.find("#dfte-set-dnd5e").on("click",(t=>{t.preventDefault(),e.find('select[name="circle"]').val(i.CENTER),e.find('select[name="cone"]').val(i.TOUCH),e.find('select[name="rect"]').val(i.TOUCH),e.find('select[name="ray"]').val(i.TOUCH)})),e.find("#cancel").on("click",(e=>{e.preventDefault(),this.close()}))}async _updateObject(e,t){await n.default.set(TemplateConfig.CONFIG_PREF,t)}}TemplateConfig.CONFIG_PREF="template-config",TemplateConfig.PATCH_5E_PREF="template-targeting-patch5e",TemplateConfig.PATCH_5E_CIRCLE_PREF="template-targeting-patch5e-circle"},"./src/TemplateTargeting.ts":(e,t,a)=>{a.r(t),a.d(t,{default:()=>TemplateTargeting});var i=a("../common/Settings.ts"),n=a("./src/LineToBoxCollision.ts"),r=a("./src/TemplateConfig.ts");class TemplateTargeting{static init(){r.TemplateConfig.init(),i.default.register(TemplateTargeting.TARGETING_TOGGLE_PREF,{config:!1,scope:"client",type:Boolean,default:!0,onChange:()=>{i.default.get(TemplateTargeting.TARGETING_MODE_PREF)}}),i.default.register(TemplateTargeting.TARGETING_MODE_PREF,{config:!0,scope:"world",name:"DF_TEMPLATES.AutoTargetName",hint:"DF_TEMPLATES.AutoTargetHint",type:String,choices:{never:"Never",toggle:"Toggle (Add toggle button)",always:"Always"},default:"toggle",onChange:()=>{ui.controls.initialize(),ui.controls.render(!0)}}),i.default.register(TemplateTargeting.GRIDLESS_RESOLUTION_PREF,{config:!0,scope:"world",name:"DF_TEMPLATES.GridlessPointResolutionName",hint:"DF_TEMPLATES.GridlessPointResolutionHint",range:{max:10,min:1,step:1},type:Number,default:3}),i.default.register(TemplateTargeting.GRIDLESS_PERCENTAGE_PREF,{config:!0,scope:"world",name:"DF_TEMPLATES.GridlessPointPercentageName",hint:"DF_TEMPLATES.GridlessPointPercentageHint",range:{max:100,min:0,step:10},type:Number,default:0}),i.default.register(TemplateTargeting.PREVIEW_PREF,{config:!0,scope:"world",name:"DF_TEMPLATES.PreviewName",hint:"DF_TEMPLATES.PreviewHint",type:Boolean,default:!0}),Hooks.on("getSceneControlButtons",(e=>{if("toggle"!==i.default.get(TemplateTargeting.TARGETING_MODE_PREF))return;e.find((e=>"measure"===e.name)).tools.splice(0,0,{icon:"fas fa-bullseye",name:"autoTarget",title:"DF_TEMPLATES.ToggleTitle",visible:!0,toggle:!0,active:i.default.get(TemplateTargeting.TARGETING_TOGGLE_PREF),onClick:e=>{i.default.set(TemplateTargeting.TARGETING_TOGGLE_PREF,e)}})})),libWrapper.register(i.default.MOD_NAME,"MeasuredTemplate.prototype.highlightGrid",this._MeasuredTemplate_highlightGrid,"OVERRIDE"),libWrapper.register(i.default.MOD_NAME,"PlaceableObject.prototype._createInteractionManager",(function(e){if(!(this instanceof MeasuredTemplate))return e();const t=e();return t.callbacks.dragLeftCancel=function(e){this.refresh(),PlaceableObject.prototype._onDragLeftCancel.apply(this,[e])},t}),"WRAPPER")}static ready(){const e=function throttle(e,t){let a;t||(t=250);let i,n=!1;return function(...r){i=[...r];const o=+new Date,s=this;if(a&&o<a+t){if(n)return;n=!0,setTimeout((function(){n=!1,a=+new Date,e.apply(s,i)}),t-(o-a))}else a=o,e.apply(s,i)}}((function(){TemplateTargeting._MeasuredTemplate_highlightGrid.apply(this)}),50);game.dnd5e&&libWrapper.register(i.default.MOD_NAME,"game.dnd5e.canvas.AbilityTemplate.prototype.refresh",(function(t,...a){return e.apply(this),t(...a)}),"WRAPPER"),libWrapper.register(i.default.MOD_NAME,"MeasuredTemplate.prototype.refresh",(function(t){return e.apply(this),t()}),"WRAPPER");const handleTemplateCreation=function(e,...t){var a;return null===(a=canvas.grid.getHighlightLayer("Template.null"))||void 0===a||a.clear(),e(...t)};libWrapper.register(i.default.MOD_NAME,"TemplateLayer.prototype._onDragLeftDrop",handleTemplateCreation,"WRAPPER"),libWrapper.register(i.default.MOD_NAME,"TemplateLayer.prototype._onDragLeftCancel",handleTemplateCreation,"WRAPPER"),canvas.controls.addChild(TemplateTargeting.PointGraphContainer)}static _MeasuredTemplate_highlightGrid(){const e=i.default.get(TemplateTargeting.TARGETING_MODE_PREF),t="always"===e||"toggle"===e&&i.default.get(TemplateTargeting.TARGETING_TOGGLE_PREF),a=this.document.user.id===game.userId;if((this.hover||!this.id)&&a&&t&&canvas.tokens.objects)for(const e of game.user.targets)e.setTarget(!1,{releaseOthers:!1,groupSelection:!0});TemplateTargeting._handleTouchTemplate.bind(this)(a,t)}static _calculateGridTestArea(){const e=this.shape,t=e.points?e.points:e.radius?[-e.radius,-e.radius,e.radius,e.radius]:[e.x,e.y,e.x+e.width,e.y+e.height],a={left:Number.MAX_VALUE,right:Number.MIN_VALUE,top:Number.MAX_VALUE,bottom:Number.MIN_VALUE,width:function(){return this.right-this.left},height:function(){return this.bottom-this.top}};for(let e=0;e<t.length;e+=2)t[e]<a.left&&(a.left=t[e]),t[e]>a.right&&(a.right=t[e]),t[e+1]<a.top&&(a.top=t[e+1]),t[e+1]>a.bottom&&(a.bottom=t[e+1]);const i=canvas.grid.grid.getSnappedPosition(a.left,a.top,1),n=canvas.grid.grid.getSnappedPosition(a.right,a.bottom,1);return[a.left,a.top]=[i.x,i.y],[a.right,a.bottom]=[n.x,n.y],a}static _handleTouchTemplate(e,t){var a,o;const s=canvas.grid,l=canvas.dimensions,c=this.borderColor,g=this.fillColor,p=i.default.get("template-debug"),d=null!==(a=this.highlightId)&&void 0!==a?a:null===(o=this._original)||void 0===o?void 0:o.highlightId;if(!this.id&&!i.default.get(TemplateTargeting.PREVIEW_PREF)||!this.shape)return;const u=s.getHighlightLayer(d);if(null==u||u.clear(),s.type===CONST.GRID_TYPES.GRIDLESS){const a=this.shape.clone();try{"points"in a?a.points=a.points.map(((e,t)=>t%2?this.y+e:this.x+e)):(a.x+=this.x,a.y+=this.y)}catch(e){}return s.grid.highlightGridPosition(u,{border:c,color:g,shape:a}),void TemplateTargeting._selectTokensByPointContainment.bind(this)(e,t,this,this.shape,!0)}const h=TemplateTargeting._calculateGridTestArea.apply(this),T=Math.ceil(h.width()/s.w)+2,m=Math.ceil(h.height()/s.h)+2,[f,E]=canvas.grid.getTopLeft(this.document.x,this.document.y),[_,P]=s.grid.getGridPositionFromPixels(h.left+f,h.top+E),M=canvas.grid.w/2,S=canvas.grid.h/2;let{direction:y,distance:R,angle:b,width:C}=this.document;R*=l.size/l.distance,C*=l.size/l.distance,b=Math.toRadians(b),y=Math.toRadians(y%360+360);const I="round"===game.settings.get("core","coneTemplateType"),A=I?R:R/Math.sin(Math.PI/2-b/2)*Math.sin(Math.PI/2);let[O,D,v,N]=[0,0,0,0],[w,G,L,F]=[0,0,0,0],x=!1;const generateConeData=()=>{x||(x=!0,[O,D,v,N]=[this.document.x,this.document.y,this.document.x+Math.cos(y-b/2)*A,this.document.y+Math.sin(y-b/2)*A],[w,G,L,F]=[this.document.x,this.document.y,this.document.x+Math.cos(y+b/2)*A,this.document.y+Math.sin(y+b/2)*A])},generateRayData=()=>{x||([O,D]=[this.document.x+Math.cos(y-Math.PI/2)*(C/2),this.document.y+Math.sin(y-Math.PI/2)*(C/2)],[v,N]=[O+Math.cos(y)*R,D+Math.sin(y)*R],[w,G]=[this.document.x+Math.cos(y+Math.PI/2)*(C/2),this.document.y+Math.sin(y+Math.PI/2)*(C/2)],[L,F]=[w+Math.cos(y)*R,G+Math.sin(y)*R])};for(let a=-1;a<m;a++)for(let i=-1;i<T;i++){const[o,l]=canvas.grid.grid.getPixelsFromGridPosition(_+a,P+i),d=o+M,h=l+S,T=new PIXI.Rectangle(o,l,canvas.grid.w,canvas.grid.h).normalize();let m=!1;switch(this.document.t){case"circle":{const[e,t]=[d-this.document.x,h-this.document.y];if(m=e*e+t*t<=R*R,m||r.TemplateConfig.config.circle===r.HighlightMode.CENTER)break;const a=R*R;let[i,n]=[0,0];const testPoint=(e,t)=>([i,n]=[e-this.document.x,t-this.document.y],i*i+n*n<a);m=testPoint(T.left,T.top)||testPoint(T.right,T.top)||testPoint(T.left,T.bottom)||testPoint(T.right,T.bottom);break}case"rect":{const e=this._getRectShape(y,R,!0);if(e instanceof PIXI.Polygon){if(m=this.shape.contains(d-this.document.x,h-this.document.y),m||r.TemplateConfig.config.rect===r.HighlightMode.CENTER)break;[O,D,v,N,L,F,w,G]=e.points.map(((e,t)=>e+(t%2?this.document.y:this.document.x))),m=n.default.cohenSutherlandLineClipAndDraw(O,D,v,N,T)||n.default.cohenSutherlandLineClipAndDraw(v,N,L,F,T)||n.default.cohenSutherlandLineClipAndDraw(L,F,w,G,T)||n.default.cohenSutherlandLineClipAndDraw(w,G,O,D,T)}else e.x+=this.document.x,e.y+=this.document.y,e.width-=1,e.height-=1,m=!(e.left>=T.right||e.right<=T.left||e.top>=T.bottom||e.bottom<=T.top);break}case"cone":if(m=this.shape.contains(d-this.document.x,h-this.document.y),m||r.TemplateConfig.config.cone===r.HighlightMode.CENTER)break;if(generateConeData(),m=n.default.cohenSutherlandLineClipAndDraw(O,D,v,N,T),m)break;if(m=n.default.cohenSutherlandLineClipAndDraw(w,G,L,F,T),m)break;if(I){const e=R*R;let[t,a]=[0,0],i=0,n=0;const testPoint=(i,n)=>([t,a]=[i-this.document.x,n-this.document.y],t*t+a*a<e),testAngle=()=>{i=Math.sqrt(t*t+a*a),t/=i,n=Math.acos(t),a<0&&(n=2*Math.PI-n);const e=y-b/2,r=y+b/2;return e<0?n<=r||n>=2*Math.PI+e:r>2*Math.PI?n<=r-2*Math.PI||n>=e:n<=r&&n>=e};if(testPoint(T.left,T.top)&&(m=testAngle(),m))break;if(testPoint(T.right,T.top)&&(m=testAngle(),m))break;if(testPoint(T.left,T.bottom)&&(m=testAngle(),m))break;testPoint(T.right,T.bottom)&&(m=testAngle())}else m=n.default.cohenSutherlandLineClipAndDraw(v,N,L,F,T);break;case"ray":if(m=this.shape.contains(d-this.document.x,h-this.document.y),m||r.TemplateConfig.config.ray===r.HighlightMode.CENTER)break;generateRayData(),m=n.default.cohenSutherlandLineClipAndDraw(O,D,v,N,T)||n.default.cohenSutherlandLineClipAndDraw(w,G,L,F,T)||n.default.cohenSutherlandLineClipAndDraw(O,D,w,G,T)||n.default.cohenSutherlandLineClipAndDraw(v,N,L,F,T)}if(p||m){try{s.grid.highlightGridPosition(u,{x:o,y:l,border:c,color:p?m?65280:16711680:g})}catch(e){if(!(e instanceof Error&&e.message.includes("'highlight'")))throw e}if(m&&(this.hover||!this.id)&&e&&t)if(r.TemplateConfig.config[this.document.t]!==r.HighlightMode.POINTS)for(const e of canvas.tokens.placeables){const t=new PIXI.Rectangle(e.x,e.y,e.w,e.h).normalize();T.left>=t.right||T.right<=t.left||T.top>=t.bottom||T.bottom<=t.top||e.setTarget(!0,{user:game.user,releaseOthers:!1,groupSelection:!0})}else TemplateTargeting._selectTokensByPointContainment.bind(this)(e,t,this.document,this.shape,!0)}}}static _selectTokensByPointContainment(e,t,a,n,r=!1){if(!e||!t)return;const o=i.default.get("template-debug");let s;TemplateTargeting.PointGraphContainer.clear(),TemplateTargeting.PointGraphContainer.removeChildren(),o&&(s=new PIXI.Graphics,TemplateTargeting.PointGraphContainer.addChild(s));const l=r?i.default.get(TemplateTargeting.GRIDLESS_RESOLUTION_PREF):1;for(const e of canvas.tokens.placeables){const t=e.w/2,r=e.h/2,[c,g]=[e.x-a.x,e.y-a.y];let p=l>1?Math.roundDecimals(e.w/canvas.grid.w,1)*(l-1)+1:Math.ceil(e.w/canvas.grid.w),d=l>1?Math.roundDecimals(e.h/canvas.grid.h,1)*(l-1)+1:Math.ceil(e.h/canvas.grid.h);e.w/canvas.grid.w<1&&(p=Math.floor(p)),e.h/canvas.grid.h<1&&(d=Math.floor(d));const u=p>1?e.w/(p-1):e.w,h=d>1?e.h/(d-1):e.h;let T=0,m=0,f=!1;o&&s.beginFill(16711680);const E=i.default.get(TemplateTargeting.GRIDLESS_PERCENTAGE_PREF)/100,_=d*p;let P=0;for(let i=0;!f&&i<d;i++)for(let M=0;M<p;M++)if(l>1?(T=p>1?c+u*M:c+t,m=d>1?g+h*i:g+r):(T=p>1?c+canvas.grid.w*M+canvas.grid.w/2:c+t,m=d>1?g+canvas.grid.h*i+canvas.grid.h/2:g+r),o&&s.drawCircle(T+a.x,m+a.y,3),n.contains(T,m)&&(P++,(0===E||Math.roundDecimals(P/_,1)>=E)&&(e.setTarget(!0,{user:game.user,releaseOthers:!1,groupSelection:!0}),!o))){f=!0;break}o&&s.endFill()}}}TemplateTargeting.PREVIEW_PREF="template-preview",TemplateTargeting.TARGETING_TOGGLE_PREF="template-targeting-toggle",TemplateTargeting.TARGETING_MODE_PREF="template-targeting",TemplateTargeting.GRIDLESS_RESOLUTION_PREF="template-gridless-resolution",TemplateTargeting.GRIDLESS_PERCENTAGE_PREF="template-gridless-percentage",TemplateTargeting.PointGraphContainer=new PIXI.Graphics}},t={};function __webpack_require__(a){var i=t[a];if(void 0!==i)return i.exports;var n=t[a]={exports:{}};return e[a](n,n.exports,__webpack_require__),n.exports}__webpack_require__.d=(e,t)=>{for(var a in t)__webpack_require__.o(t,a)&&!__webpack_require__.o(e,a)&&Object.defineProperty(e,a,{enumerable:!0,get:t[a]})},__webpack_require__.o=(e,t)=>Object.prototype.hasOwnProperty.call(e,t),__webpack_require__.r=e=>{"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})};var a={};(()=>{__webpack_require__.r(a);var e=__webpack_require__("../common/Settings.ts"),t=__webpack_require__("./src/AngleSnaps.ts"),i=__webpack_require__("./src/SnapIntersect.ts"),n=__webpack_require__("./src/SquareTemplate.ts"),r=__webpack_require__("./src/TemplateTargeting.ts");e.default.init("df-templates"),Hooks.once("init",(function(){r.default.init(),i.default.init(),t.default.init(),n.default.init(),e.default.register("template-debug",{config:!0,scope:"client",name:"DF_TEMPLATES.DebugName",hint:"DF_TEMPLATES.DebugHint",type:Boolean,default:!1})})),Hooks.once("ready",(function(){var a;if(!(null===(a=game.modules.get("lib-wrapper"))||void 0===a?void 0:a.active))return console.error("Missing libWrapper module dependency"),void(game.user.isGM&&ui.notifications.error(game.i18n.localize("DF-QOL.errorLibWrapperMissing")));r.default.ready(),i.default.ready(),t.default.ready(),game.dnd5e&&libWrapper.register(e.default.MOD_NAME,"game.dnd5e.canvas.AbilityTemplate.prototype.activatePreviewListeners",(function(e,a){return this._onMovePlacement_ORIG=this._onMovePlacement,this._onMovePlacement=i.default.handleDnD5eAbilityTemplate.bind(this),this._onRotatePlacement_ORIG=this._onRotatePlacement,this._onRotatePlacement=t.default.handleDnD5eAbilityTemplate.bind(this),e(a)}),"WRAPPER")}))})()})();
//# sourceMappingURL=main.js.map