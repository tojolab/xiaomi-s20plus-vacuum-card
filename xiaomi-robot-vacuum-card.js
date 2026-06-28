// xiaomi-robot-vacuum-card — v1.3.2
// MIT License — https://github.com/tojolab/xiaomi-robot-vacuum-card
const CARD_VERSION = '1.3.2';

class XiaomiS20PlusVacuumCardV3 extends HTMLElement {
  _syncThemeVars() {
    const vars = [
      '--primary-color', '--accent-color', '--primary-background-color', '--secondary-background-color',
      '--card-background-color', '--ha-card-background', '--ha-card-border-radius', '--ha-card-box-shadow',
      '--ha-card-border-color', '--ha-chip-background', '--ha-chip-border-color', '--ha-edit-icon-hover-bg',
      '--primary-text-color', '--secondary-text-color', '--disabled-text-color', '--divider-color', '--ha-divider-color',
      '--state-active-background', '--state-active-border-color', '--state-active-shadow',
      '--state-paused-background', '--state-paused-border-color', '--state-paused-shadow',
      '--state-on-background', '--state-on-border-color', '--state-on-shadow',
      '--state-error-background', '--state-error-border-color', '--state-error-shadow',
      '--state-home-background', '--state-home-border-color', '--state-home-shadow',
      '--state-paused-background-active', '--state-paused-border-color-active', '--state-paused-shadow-active',
      '--state-on-background-active', '--state-on-border-color-active', '--state-on-shadow-active',
      '--state-error-background-active', '--state-error-border-color-active', '--state-error-shadow-active',
      '--success-color', '--warning-color', '--error-color', '--text-on-primary-color',
    ];
    const root = document.documentElement;
    const style = this.style;
    vars.forEach(v => {
      const val = getComputedStyle(root).getPropertyValue(v);
      if (val) style.setProperty(v, val);
    });
  }
  constructor() {
    super();
    this.attachShadow({mode:'open'});
    this._hass=null;this._config={};this._selectedRooms=[];
    this._fanLevel='Turbo';this._waterLevel='Off';this._cleanMode='Vacuuming';this._route='Daily';
    this._running=false;this._rooms=[];this._rendered=false;this._vacuumState='idle';
    this._battery=null;this._optsSynced=false;this._rawStatus='';this._cleaningLocked=false;this._cleaningLockedAt=0;
    this._modeOpts=null;this._fanOpts=null;this._waterOpts=null;this._routeOpts=null;this._activeVc='';
    this._optimisticState=null;this._lastAction=null;
    this._sensorMode='unknown';this._detectionStartedAt=0;this._staleDetectedAt=0;
    this._cleaningModeTab='rooms';this._selectedZones=[];this._zoneDrawing=null;this._mapZoom=1;this._mapPan={x:0,y:0};
    this._customIcons={};this._customNames={};this._iconsLoaded=false;
    this._E={vc:'',vc_alt:null,bat:null,status:null,mode:null,fan:null,water:null,route:null};
  }
  _modeInt(){return{'Sweep':1,'Mop':2,'Sweep Mop':3,'Sweep Before Mopping':4,'Vacuuming':1,'Mopping':2,'Vacuuming & Mopping':3,'Vacuuming before mopping':4}[this._cleanMode]||1;}
  _fanInt(){return{'Silent':1,'Basic':2,'Standard':2,'Strong':3,'Full Speed':4,'Turbo':4}[this._fanLevel]||4;}
  _waterInt(){return{'Off':0,'Level1':1,'Level2':2,'Level3':3}[this._waterLevel]||0;}
  setConfig(c){
    this._config=c;
    this._E={
      vc:c.entity||'',
      vc_alt:c.entity_alt||null,
      bat:c.battery_sensor||null,
      mode:c.mode_select||null,
      fan:c.fan_select||null,
      water:c.water_select||null,
      route:c.route_select||null,
      status:c.status_sensor||null,
    };
    this._devResolved=false;
    this._optsSynced=false;
    this._rendered=false;
    this._sensorMode='unknown';
    this._syncThemeVars();
    this.render();
  }
  set hass(h){
    this._hass=h;
    this._syncThemeVars();
    if(!this._iconsLoaded){this._iconsLoaded=true;this._loadCustomIcons();}
    if(!this._devResolved&&this._E.vc&&h.entities){
      const did=h.entities[this._E.vc]?.device_id;
      if(did){
        const sd=Object.values(h.entities).filter(e=>e.device_id===did);
        const fs=suffix=>sd.find(e=>e.entity_id.startsWith('select.')&&e.entity_id.endsWith(suffix))?.entity_id??null;
        if(!this._config.mode_select)this._E.mode=fs('_sweep_mop_type');
        if(!this._config.fan_select)this._E.fan=fs('_suction_level');
        if(!this._config.water_select)this._E.water=fs('_mop_water_output_level');
        if(!this._config.route_select)this._E.route=fs('_sweep_route');
        if(!this._config.entity_alt){
          const alt=sd.find(e=>e.entity_id.startsWith('vacuum.')&&e.entity_id!==this._E.vc)?.entity_id??null;
          if(alt)this._E.vc_alt=alt;
        }
        this._devResolved=true;
      }
    }
    let changed=false;
    {
      const ms=this._E.mode?h.states[this._E.mode]:null;
      const fs=this._E.fan?h.states[this._E.fan]:null;
      const ws=this._E.water?h.states[this._E.water]:null;
      const rs=this._E.route?h.states[this._E.route]:null;
      const mo=ms?.attributes?.options||null;
      const fo=fs?.attributes?.options||null;
      const wo=ws?.attributes?.options||null;
      const ro=rs?.attributes?.options||null;
      if(mo&&JSON.stringify(mo)!==JSON.stringify(this._modeOpts)){this._modeOpts=mo;changed=true;}
      if(fo&&JSON.stringify(fo)!==JSON.stringify(this._fanOpts)){this._fanOpts=fo;changed=true;}
      if(wo&&JSON.stringify(wo)!==JSON.stringify(this._waterOpts)){this._waterOpts=wo;changed=true;}
      if(ro&&JSON.stringify(ro)!==JSON.stringify(this._routeOpts)){this._routeOpts=ro;changed=true;}
      if(!this._optsSynced){
        if(ms&&this._modeOpts?.includes(ms.state))this._cleanMode=ms.state;
        if(fs&&this._fanOpts?.includes(fs.state))this._fanLevel=fs.state;
        if(ws&&this._waterOpts?.includes(ws.state))this._waterLevel=ws.state;
        if(rs&&this._routeOpts?.includes(rs.state))this._route=rs.state;
        if(ms||fs||ws||rs)this._optsSynced=true;
      }
    }
    const vs1=h.states[this._E.vc];
    const vs2=this._E.vc_alt?h.states[this._E.vc_alt]:null;
    const vs=(vs1&&vs1.state!=='unavailable')?vs1:(vs2||vs1);
    const newAvc=(vs1&&vs1.state!=='unavailable')?this._E.vc:(this._E.vc_alt||this._E.vc);
    if(newAvc!==this._activeVc){this._activeVc=newAvc;changed=true;}
    const bs=this._E.bat?h.states[this._E.bat]:null;
    let ss=this._E.status?h.states[this._E.status]:null;
    if(!ss){for(const[id,st]of Object.entries(h.states)){if(id.startsWith('sensor.')&&id.endsWith('_status')&&st.attributes?.['vacuum.status']!==undefined){ss=st;break;}}}
    const nb=vs?.attributes?.battery_level??(bs?parseFloat(bs.state):null);
    const rawStatus=ss&&ss.state&&ss.state!=='unavailable'&&ss.state!=='unknown'?ss.state:'';
    const nvs=vs?vs.state:'unknown';
    // Load rooms: prefer camera entity (xiaomi_cloud_map_extractor), fallback to vacuum_extend.room_info
    {
      let nr=[];
      const camId=this._config.camera_entity||this._config.map_source?.camera_entity;
      const camState=camId?h.states[camId]:null;
      const camRooms=camState?.attributes?.rooms??null;
      if(camRooms&&typeof camRooms==='object'&&!Array.isArray(camRooms)){
        nr=Object.values(camRooms)
          .filter(r=>r.name&&r.name.trim())
          .map(r=>({id:String(r.number),name:r.name,icon:this._icon(r.name)}));
      } else if(vs){try{
        const ri=JSON.parse(vs.attributes['vacuum_extend.room_info']||'{}');
        const attrs=ri.room_attrs||[];
        if(attrs.length>1&&Array.isArray(attrs[0])){
          const hd=attrs[0],ii=hd.indexOf('id'),ni=hd.indexOf('room_name');
          nr=attrs.slice(1).filter(r=>r[ni]&&r[ni].trim()!='').map(r=>({id:String(r[ii]),name:r[ni],icon:this._icon(r[ni])}));
        }
      }catch(e){}}
      // Filter and reorder rooms based on config.rooms (array of names or IDs)
      const cfgRooms=this._config.rooms;
      if(Array.isArray(cfgRooms)&&cfgRooms.length){
        const keys=cfgRooms.map(v=>String(v).trim().toLowerCase());
        nr=keys.map(k=>nr.find(r=>r.name.toLowerCase()===k||r.id.toLowerCase()===k)).filter(Boolean);
      }
      if(JSON.stringify(nr)!==JSON.stringify(this._rooms)){this._rooms=nr;changed=true;}
    }
    const cleaningStatuses=new Set(['sweeping','mapping','working','cleaning','pausing','returning','gowash','multitaskstationworking','stationworking','washbreak']);
    const doneStatuses=new Set(['charging','charged','fully charged']);
    const stationWorkingStatuses=new Set(['multitaskstationworking','stationworking','multitaskrecharge','washbreak','gowash']);
    if(this._cleaningLocked&&this._sensorMode==='detecting'){
      if(cleaningStatuses.has(rawStatus)){this._sensorMode='live';}
      else if(Date.now()-this._detectionStartedAt>90000){this._sensorMode='stale';this._staleDetectedAt=Date.now();}
    }
    const wasLocked=this._cleaningLocked;
    if(this._cleaningLocked){
      const elapsed=Date.now()-this._cleaningLockedAt;
      if(this._sensorMode!=='stale'){
        if(elapsed>30000&&(doneStatuses.has(rawStatus)||(nvs==='docked'&&!stationWorkingStatuses.has(rawStatus)))){this._cleaningLocked=false;}
      }else{
        if(doneStatuses.has(rawStatus)||(nvs==='docked'&&!stationWorkingStatuses.has(rawStatus))){this._cleaningLocked=false;}
        else if(Date.now()-this._staleDetectedAt>30*60*1000){this._cleaningLocked=false;}
      }
      if(elapsed>90*60*1000){this._cleaningLocked=false;}
    }
    if(wasLocked&&!this._cleaningLocked){this._lastAction=null;this._selectedRooms=[];if(this._sensorMode==='live')this._selectedZones=[];this._hass.callWS({type:'frontend/set_user_data',key:'xiaomi-robot-vacuum-card-cleaning-state',value:null});}
    if(nvs!==this._vacuumState){this._vacuumState=nvs;this._optimisticState=null;changed=true;}
    if(!this._cleaningLocked&&rawStatus!==this._rawStatus){this._rawStatus=rawStatus;changed=true;}
    if(nb!==this._battery){this._battery=nb;changed=true;}
    if(changed||!this._rendered)this.render();
  }
  _icon(n){
    if(!n)return'mdi:home';const l=n.toLowerCase();
    if(l.includes('bedroom'))return'mdi:bed';
    if(l.includes('kitchen'))return'mdi:food-fork-drink';
    if(l.includes('hallway'))return'mdi:door';
    if(l.includes('toilet'))return'mdi:toilet';
    if(l.includes('living'))return'mdi:sofa';
    if(l.includes('bathroom'))return'mdi:shower';
    if(l.includes('office'))return'mdi:desk';
    if(l.includes('dining'))return'mdi:silverware-fork-knife';
    if(l.includes('garage'))return'mdi:garage';
    if(l.includes('laundry'))return'mdi:washing-machine';
    if(l.includes('study'))return'mdi:book-open';
    if(l.includes('balcony')||l.includes('terrace'))return'mdi:balcony';
    if(l.includes('corridor')||l.includes('entrance'))return'mdi:door';
    return'mdi:home';
  }
  _svg(key,sz=22,c='currentColor'){
    const p={
      spn:'M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z',
      pen:'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.84 1.83 3.75 3.75 1.84-1.83z',
    };
    return`<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="${c}"><path d="${p[key]||p.spn}"/></svg>`;
  }
  _cicon(key,sz=27,c='currentColor'){
    const i={
      vac:'m 13.977098,21.475115 c 0.289468,-1.304921 0.589103,-3.175068 0.66586,-4.155883 0.120591,-1.540962 0.01255,-1.801413 -0.795134,-1.916588 -0.845206,-0.120534 -0.99179,0.193585 -1.531115,3.28096 l -0.596426,3.41425 -4.103912,0.12654 -4.1039123,0.12654 0.3177019,-4.901811 c 0.1747352,-2.696 0.4184799,-5.16445 0.5416602,-5.485441 0.1437761,-0.374682 0.9778443,-0.583631 2.3297004,-0.583631 2.3747064,0 2.3174252,0.101124 2.8496451,-5.0308052 C 9.9782554,2.2310329 10.001598,2.1933631 12.126016,2.1933631 h 1.87789 l 0.608032,4.4839787 0.608036,4.4839792 2.264182,0.131098 2.264177,0.131103 0.27851,2.712396 c 0.153181,1.491817 0.31544,3.893546 0.360586,5.337168 l 0.08208,2.624768 -1.968576,0.218731 c -1.36099,0.151221 -1.968576,0.421262 -1.968576,0.874922 0,0.501169 0.66128,0.687362 2.799066,0.788118 1.539488,0.07256 2.985905,-0.05491 3.214265,-0.283274 C 23.001025,23.241015 22.068186,10.88481 21.510327,9.9821785 21.332306,9.6941321 20.239007,9.3494607 19.08078,9.2162406 L 16.974911,8.9740182 16.484465,4.9810724 C 16.214717,2.7849464 15.857456,0.767156 15.690542,0.49709362 15.260903,-0.19808057 9.107143,-0.14998169 8.5520789,0.55288744 8.3145724,0.85364211 7.8991941,2.8583043 7.629018,5.0076963 7.3565146,7.1755665 6.8918869,9.0717777 6.5855371,9.2662468 6.2817989,9.4590579 5.2888929,9.6198293 4.3790783,9.6235127 3.4604183,9.6274499 2.6351824,9.87336 2.5231661,10.177037 c -0.3098364,0.84 -1.3555221,12.853769 -1.1678162,13.416891 0.1154286,0.34629 1.9716208,0.459899 6.1305001,0.375224 l 5.964943,-0.121448 z',
      mop:'M 8.0186923,23.287358 C 5.6184861,22.159203 3.257728,19.491039 2.5399003,17.09515 1.7148708,14.34145 2.3380686,11.48086 4.4655749,8.2559369 6.6123366,5.0018323 11.139831,-4.6475292e-6 11.938581,-4.6475292e-6 c 1.457017,0 8.048988,8.1565971475292 9.354352,11.5746376475292 1.522693,3.987117 -0.417129,8.957752 -4.404677,11.286602 -2.268235,1.324724 -6.522859,1.529126 -8.8695637,0.426123 z m 8.1751667,-2.778612 c 3.43101,-2.561619 4.149145,-5.530315 2.267931,-9.375373 -1.256459,-2.568114 -5.60985,-7.8200063 -6.482147,-7.8200063 -1.268098,0 -6.6785305,7.1172303 -7.2888441,9.5882193 -0.7550936,3.057149 1.2044247,6.848199 4.255164,8.232403 1.9157391,0.86922 5.6813101,0.544382 7.2478961,-0.625243 z',
      vacmop:'m 13.55516,23.225355 c 2.066363,-1.032268 2.205759,-2.270991 0.232971,-2.070319 C 9.1347229,21.628373 7.0761969,21.460937 5.7847852,20.504063 0.83467879,16.836282 1.3648751,11.933441 7.4239813,5.346007 L 9.7280079,2.8410799 10.724203,3.7418219 C 11.660105,4.5880485 11.768129,4.5948327 12.50909,3.8538671 13.250051,3.1129063 13.195703,2.963101 11.611097,1.3784948 10.031355,-0.2012517 9.8608295,-0.26365076 8.9214935,0.39428377 7.0747711,1.6877783 2.3627615,7.4738699 1.1403792,9.9490653 -0.48244832,13.235127 -0.29203613,17.011551 1.636818,19.794889 4.1758707,23.458746 9.8301285,25.086214 13.55516,23.225355 Z M 23.924437,17.38725 C 23.789616,14.762567 22.591249,12.229613 20.580501,10.319275 19.265619,9.0700548 19.06675,9.0113414 18.40199,9.676102 c -0.664766,0.664761 -0.606607,0.875329 0.637051,2.306603 1.851661,2.130994 2.287448,3.05385 2.680783,5.677043 0.290031,1.934245 0.47029,2.218996 1.327327,2.096742 0.872911,-0.124523 0.978013,-0.408366 0.877286,-2.36924 z m -6.175792,-0.751822 c 0.734778,-0.20439 1.164857,-0.660329 1.164857,-1.234897 0,-0.832966 -0.281299,-0.897182 -3.288592,-0.750751 -2.291241,0.11157 -3.838166,-0.06949 -5.100736,-0.597031 -1.9960248,-0.833991 -3.0262709,-0.68248 -3.0262709,0.44506 0,1.803729 6.5446649,3.168508 10.2507419,2.137619 z m -2.160992,-5.389965 c 0.2752,-1.163665 1.280295,-2.6703279 2.919188,-4.3759488 C 20.701217,4.5858027 20.923062,4.185008 20.324227,3.5861737 19.725393,2.9873393 19.439053,3.0485689 17.97849,4.0877751 14.732378,6.3974163 12.316679,11.133599 13.597556,12.67696 c 0.850327,1.024585 1.523819,0.540135 1.990097,-1.431497 z',
      vacbmop:'m 10.142652,21.933107 c 0.215404,-0.263047 0.614539,-1.813376 0.886961,-3.445164 0.384259,-2.301687 0.392738,-3.069471 0.0378,-3.424395 -0.733349,-0.733353 -1.2711166,0.133712 -1.751477,2.823951 l -0.4320172,2.419498 -3.5834174,0.110625 -3.5834212,0.110626 0.2590335,-2.980231 c 0.4884947,-5.620236 0.4181779,-5.467221 2.5130891,-5.467221 2.0664141,0 2.0460055,0.03294 2.4888697,-4.0174471 C 7.3793333,4.3935142 7.39305,4.3716058 9.2073904,4.5037453 l 1.5938436,0.1160775 0.392313,3.2522191 c 0.215772,1.7887166 0.527242,3.4674391 0.692157,3.7304861 0.165515,0.264004 1.049514,0.478268 1.97324,0.478268 1.977739,0 1.950547,-0.05738 2.312144,4.878329 l 0.259286,3.539179 h -1.721446 c -1.780785,0 -2.527643,0.65308 -1.696897,1.483827 0.512523,0.512527 4.062623,0.563705 4.843129,0.06983 0.472754,-0.299143 0.481726,-1.080123 0.06424,-5.592596 -0.266881,-2.884696 -0.575616,-5.480414 -0.686073,-5.768266 -0.13147,-0.342608 -0.83794,-0.52337 -2.045439,-0.52337 H 13.343287 L 13.083301,7.9676954 C 12.940307,6.7576747 12.704995,5.1650439 12.560378,4.4285158 L 12.297438,3.0893667 H 9.0730278 5.8486171 L 5.3189951,6.6285463 4.7893693,10.167726 h -1.84661 c -1.4305249,0 -1.8898415,0.150872 -2.03845261,0.669574 -0.35919803,1.253696 -1.08104528,10.448122 -0.8645661,11.012255 0.28894245,0.752962 9.49240111,0.829079 10.10291141,0.08355 z m 12.562771,-7.816598 c 1.195428,-1.195428 1.295883,-1.480563 1.294563,-3.674579 -0.0011,-1.740094 -0.216858,-2.7319673 -0.803975,-3.6950373 -1.145359,-1.8787955 -3.75383,-4.9024754 -4.464547,-5.1752065 -0.39237,-0.1505663 -1.192814,0.3421946 -2.287607,1.4082644 -2.174541,2.1174931 -2.582063,2.860981 -1.971453,3.5967247 0.404503,0.4873967 0.7279,0.3167891 2.259879,-1.1921525 l 1.787825,-1.7609427 1.34503,1.6459633 c 3.497406,4.2799051 3.417661,6.8679786 -0.275956,8.9556586 -0.62308,0.352173 -0.666112,0.521032 -0.258074,1.012688 0.674614,0.812863 1.821071,0.43186 3.374315,-1.121381 z',
      silent:'M 9.1084607,23.658488 C 5.7794747,22.848051 2.1842519,19.717439 0.81265484,16.434746 -0.21891314,13.96586 -0.07835849,9.6249394 1.1236189,6.830869 2.2432584,4.2281976 4.9031787,1.5405954 7.3861846,0.50312954 9.9166066,-0.55414821 10.205422,-0.19189245 10.1779,4.0046979 c -0.02164,3.3024272 0.117004,3.9314356 1.279111,5.8024147 1.843023,2.9672374 3.919923,3.9310844 8.561919,3.9734014 3.492128,0.03182 3.705571,0.09161 3.845354,1.07703 0.199434,1.405925 -1.811721,4.729908 -3.913627,6.468335 -2.786164,2.304366 -7.124405,3.237701 -10.8421963,2.332609 z m 7.3078283,-2.706971 c 1.763028,-0.800929 4.789276,-3.734403 4.789276,-4.642467 0,-0.242334 -1.209076,-0.440608 -2.68684,-0.440608 -5.863466,0 -10.097923,-3.988173 -10.4719974,-9.8629379 C 7.8205391,2.4533105 7.3440319,2.3269163 4.8519555,5.1580632 0.45956092,10.148087 1.618217,17.226093 7.3687374,20.532615 c 2.6651746,1.532457 6.2327616,1.697639 9.0475516,0.418902 z',
      standard:'m 23.88121,22.141394 c 0.95158,-2.479774 -4.003889,-9.705823 -8.083231,-11.786947 -3.622987,-1.8483083 -4.272372,0.181544 -0.822121,2.569769 3.150026,2.180424 4.323165,3.587217 5.82695,6.987535 1.28594,2.90774 2.484946,3.776163 3.078402,2.229643 z m -11.074711,-1.39212 c 3.206283,-1.3793 4.051099,-2.309674 3.027104,-3.333679 C 15.18662,16.768612 14.744371,16.846101 12.492501,18.001008 10.149052,19.20288 9.4166825,19.315738 4.9485412,19.16351 0.29106327,19.004839 -5.010596e-6,19.0562 -5.010596e-6,20.03672 c 0,2.397659 7.871313810596,2.835621 12.806504010596,0.712554 z M 9.7265657,13.207758 C 10.147463,9.4007942 11.037326,7.1766727 13.230116,4.4510134 14.956252,2.3054124 15.068063,1.394734 13.639376,1.1176363 12.464237,0.88971144 10.256071,3.352582 8.8196222,6.4933306 6.6886376,11.152658 6.4953421,16.930486 8.4832252,16.548506 9.1606291,16.418343 9.4607663,15.611897 9.7265657,13.207758 Z',
      strong:'m 7.6699358,23.723279 c 0,0.818754 -0.4502683,-0.835295 0.5186752,-1.466134 2.403773,-1.56499 4.663452,-3.952035 5.725862,-6.048599 1.062596,-2.096936 2.068151,-2.733792 2.700632,-1.710413 0.162737,0.263322 -0.2406,1.57531 -0.896312,2.915536 -1.230146,2.514327 -3.741507,5.129206 -6.0950247,6.346253 C 8.405752,24.389788 7.6699358,22.861628 7.6699358,23.723265 Z M 6.5946366,15.775097 C 5.5940706,15.252019 4.2871996,14.387166 3.6904802,13.853205 2.0144458,12.353447 -2.8195584e-6,9.4278561 -2.8195584e-6,8.4935049 -2.8195584e-6,7.2096923 1.5155454,7.4716405 2.3683005,8.902841 c 1.1054799,1.855359 3.5053828,4.001777 5.8181456,5.203612 2.1383319,1.111192 2.6939879,2.341256 1.1370068,2.51701 -0.500283,0.05647 -1.7282503,-0.325293 -2.7288163,-0.848366 z M 21.630055,15.435859 C 20.696318,13.630206 17.083429,10.535897 15.172584,9.905258 13.481892,9.3472787 13.187793,8.0236573 14.690221,7.7343164 c 2.658058,-0.5118942 10.075026,6.1812966 9.24542,8.3432106 -0.418468,1.090517 -1.576501,0.768221 -2.305586,-0.641668 z M 7.5074803,9.931391 C 6.6748092,8.584097 10.798042,2.7295808 13.952735,0.77987339 15.453752,-0.14780591 15.578177,-0.15804352 16.296502,0.58697336 17.005712,1.3225349 16.997826,1.4078741 16.175352,1.8978285 14.110165,3.1280744 11.208738,6.1815289 10.184695,8.2023811 9.1377115,10.268509 8.1214594,10.924826 7.5074803,9.931391 Z',
      turbo:'m 4.3690837,22.710735 c 0,-0.480604 0.1892336,-0.873816 0.4205196,-0.873816 1.4331283,0 5.5478367,-2.092034 7.4130017,-3.768979 2.112857,-1.899641 3.08918,-2.14504 3.08918,-0.776473 0,1.181539 -3.867239,4.458376 -6.3642342,5.392621 -3.1395995,1.174671 -4.5584671,1.182963 -4.5584671,0.02665 z M 18.54945,23.116666 c -0.174724,-0.282706 -0.360798,-1.756458 -0.413507,-3.275002 -0.06775,-1.952031 -0.434448,-3.453107 -1.251541,-5.123179 -1.408596,-2.879067 -1.44388,-3.470073 -0.196333,-3.28852 1.944652,0.282994 4.215551,7.028933 3.49232,10.374286 -0.340089,1.573109 -1.094586,2.18025 -1.630939,1.312415 z M 7.4274401,17.163335 C 4.3159338,16.045143 3.0522272e-6,11.674236 3.0522272e-6,9.6412898 3.0522272e-6,8.1459283 1.1638912,8.6008107 2.6567973,10.679646 c 1.3982718,1.947058 3.4838743,3.630496 5.7536859,4.644219 2.1905308,0.978311 1.2931605,2.657471 -0.9830431,1.83947 z M 7.0432843,11.633136 C 6.4761296,10.94976 6.9905233,7.5627565 8.0445989,5.0399926 9.0056088,2.7399775 10.912258,0.42841927 11.848377,0.42841927 c 1.197958,0 1.014549,0.93673093 -0.674992,3.44737933 C 10.301762,5.1710169 9.4609238,7.151377 9.1605408,8.6164652 8.4663288,12.002455 8.3905515,12.224937 7.9315577,12.224937 c -0.2184191,0 -0.6181419,-0.266309 -0.8882734,-0.591801 z M 20.97159,9.4997666 C 18.684485,8.6824295 17.397424,8.6450302 12.889001,9.2649241 c -0.611025,0.084013 -0.9142,-0.1644522 -1.008673,-0.82663 -0.118253,-0.8288802 0.17624,-1.011381 2.365394,-1.4658484 3.506126,-0.727867 9.028317,0.4175486 9.634981,1.9984961 0.474006,1.2352392 -0.458199,1.4047032 -2.909113,0.5288248 z',
      w1:'m 16.280931,23.116703 c 3.445578,-1.562111 5.37431,-4.154994 5.89015,-7.918424 0.215517,-1.572427 0.03173,-2.401138 -1.029483,-4.641783 -1.310031,-2.7660246 -6.177,-8.8468497 -8.077544,-10.09216072 -0.94713,-0.62056195 -1.132168,-0.61995762 -2.088651,0.006907 C 9.5220504,1.4235386 4.6551457,7.1979245 3.2475846,9.6399843 1.0902167,13.382997 1.2563604,16.603176 3.7870928,20.096729 6.395184,23.697076 12.008209,25.05393 16.280931,23.116875 Z M 8.1829946,20.94711 C 6.0492086,19.890911 4.9051317,18.454459 4.2449472,16.00273 3.6800787,13.904966 4.1074014,12.109714 5.7711471,9.5908176 7.298737,7.2780416 11.517384,2.8646962 12.200512,2.8646962 c 0.827722,0 5.713491,5.9861609 6.95505,8.5215038 0.868627,1.773798 1.044475,2.612826 0.814264,3.884987 -0.955522,5.280345 -6.850795,8.119191 -11.7868314,5.675923 z m 6.5871084,-5.348289 c 0,-0.745184 -0.330242,-0.88077 -2.413052,-0.990715 -1.740552,-0.0919 -2.5629436,0.05318 -2.9509027,0.520674 -0.9422691,1.135366 -0.091763,1.594917 2.7036487,1.460928 2.330017,-0.111715 2.660306,-0.234739 2.660306,-0.990887 z',
      w2:'M 8.3286568,23.42052 C 4.3003025,21.982967 1.9460867,18.679803 1.9460867,14.465256 c 0,-3.375568 1.499405,-6.0789478 6.0106769,-10.8370623 3.7733584,-3.97985299 3.7834414,-3.98664758 4.8359574,-3.25910754 1.673611,1.15689724 6.734569,7.17889124 8.050075,9.57876504 3.584057,6.5383388 -1.197765,14.0521558 -8.942857,14.0521558 -1.071121,0 -2.6781966,-0.260747 -3.5712822,-0.579487 z m 7.4425992,-2.399874 c 2.027755,-1.034465 3.318303,-2.598172 3.98734,-4.83121 0.875978,-2.92375 -0.625842,-6.107216 -5.356272,-11.3537534 L 12.111791,2.2952431 9.7337902,4.740039 c -3.0405816,3.1259856 -5.5135815,6.801684 -5.8760359,8.733726 -0.3413263,1.819391 0.6948135,4.834889 2.102405,6.118633 2.6336811,2.401951 6.7327857,2.998663 9.8110967,1.428248 z M 9.1670135,17.38273 c -0.3915542,-1.0204 0.6518605,-1.567472 2.9895655,-1.567472 1.655149,0 2.317011,0.181376 2.511509,0.6882 0.447906,1.167241 -0.126328,1.47568 -2.747389,1.47568 -1.745828,0 -2.5954279,-0.184016 -2.7536855,-0.596408 z M 9.3190131,12.588392 C 8.4391186,11.528177 9.2358812,11.05472 11.899939,11.05472 c 1.400065,0 2.671207,0.203275 2.82476,0.451731 0.564375,0.913158 -0.753792,1.712149 -2.82476,1.712149 -1.273764,0 -2.257192,-0.240147 -2.5809259,-0.630208 z',
      w3:'M 8.6089838,23.531194 C 2.6875586,21.327244 0.2566252,15.277189 3.1624756,9.976077 4.4817597,7.5693097 9.5572552,1.530018 11.235673,0.36979759 c 1.055591,-0.72967325 1.065496,-0.72298935 4.863885,3.28326921 4.894427,5.1622255 6.182939,7.6686432 5.936004,11.5466492 -0.226228,3.552882 -1.783077,5.974233 -4.858937,7.557144 -2.498337,1.285696 -6.276397,1.627139 -8.5676412,0.774334 z m 7.2909992,-2.438103 c 2.084799,-0.94651 3.949211,-3.448067 4.33314,-5.813949 0.192049,-1.183484 -0.02452,-2.135115 -0.878138,-3.858519 C 17.823348,8.3283227 12.745726,2.3636388 11.915994,2.6820354 10.814223,3.1048136 6.0009357,9.0404616 4.9250236,11.303134 c -1.2363387,2.60008 -1.279758,3.777357 -0.2240972,6.076271 1.8848026,4.10452 6.7700846,5.724541 11.1990566,3.713686 z M 9.1685084,17.508482 C 9.299439,16.585106 9.518532,16.511366 12.13102,16.511366 c 2.531778,0 2.821125,0.08902 2.821125,0.868039 0,0.770644 -0.332376,0.882534 -2.962511,0.997116 -2.872839,0.125171 -2.9582366,0.09891 -2.8211256,-0.868039 z M 9.0928849,14.12426 c 0,-0.785358 0.2893476,-0.868039 3.0381351,-0.868039 2.748787,0 3.038135,0.08268 3.038135,0.868039 0,0.785358 -0.289348,0.868038 -3.038135,0.868038 -2.7487875,0 -3.0381351,-0.08268 -3.0381351,-0.868038 z M 9.4005872,11.683162 C 9.2313501,11.513938 9.0928849,11.008479 9.0928849,10.55992 c 0,-0.7301509 0.3066867,-0.8020679 2.9296301,-0.687183 2.597506,0.1137998 2.92963,0.226732 2.92963,0.996378 0,0.758232 -0.331634,0.884097 -2.621928,0.994903 -1.442059,0.06979 -2.7603926,-0.01172 -2.9296298,-0.180856 z',
    };
    if(key==='w0')return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="${c}"><path d="M 9.0787806,21.456886 C 5.3881729,20.139861 3.2313399,17.113642 3.2313399,13.252452 c 0,-3.092553 1.3736914,-5.5692746 5.5067278,-9.9284576 3.4569913,-3.64617294 3.4662293,-3.65239785 4.4305003,-2.98585646 1.533291,1.05990036 6.169926,6.57699636 7.375137,8.77565916 3.283562,5.9901499 -1.097341,12.8739909 -8.193067,12.8739909 -0.981316,0 -2.4536502,-0.238886 -3.2718574,-0.530902 z m 6.8185944,-2.198663 c 1.857744,-0.947733 3.040088,-2.380335 3.653032,-4.42615 C 20.352941,12.153457 18.977033,9.2368997 14.643218,4.4302445 L 12.544728,2.1028014 10.366104,4.34262 c -2.7856519,2.8638957 -5.0513098,6.231415 -5.3833751,8.00147 -0.3127087,1.666849 0.6365587,4.429521 1.9261345,5.605633 2.4128671,2.200566 6.1682936,2.747248 8.9885116,1.3085 z"/><rect width="28.327147" height="2.5751948" x="-14.523537" y="16.042799" transform="rotate(-45)"/></svg>`;
      if(typeof key==='string'&&key.startsWith('mdi:'))return`<ha-icon icon="${key}" style="--mdc-icon-size:${sz}px;width:${sz}px;height:${sz}px;display:flex;align-items:center;justify-content:center;"></ha-icon>`;
      if(!i[key])return'';
      return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="${c}"><path d="${i[key]}"/></svg>`;
  }
  _batteryIcon(pct){
    if(pct===null)return'mdi:battery-unknown';
    const r=Math.round(pct/10)*10;
    if(r>=100)return'mdi:battery';
    if(r<=0)return'mdi:battery-outline';
    return`mdi:battery-${r}`;
  }
  _batteryColor(){
    if(this._battery===null)return'#6f7d8d';
    if(this._battery>50)return'#43d17c';
    if(this._battery>20)return'#ffb648';
    return'#ff6b6b';
  }
  _capitalize(s){return s.replace(/\b\w/g,c=>c.toUpperCase());}
  _stateLabel(){
    const vs=this._optimisticState||this._vacuumState;
    if(this._cleaningLocked&&vs==='paused')return'Paused';
    const stationLabels={'multitaskstationworking':'Station working','stationworking':'Station working','multitaskrecharge':'Returning to charge','washbreak':'Washing mop','gowash':'Going to wash'};
    if(this._cleaningLocked&&stationLabels[this._rawStatus])return stationLabels[this._rawStatus];
    if(this._cleaningLocked)return'Working';
    if(this._sensorMode==='stale')return'';
    if(stationLabels[this._rawStatus])return stationLabels[this._rawStatus];
    const show=new Set(['charging','charged','fully charged']);
    if(show.has(this._rawStatus))return this._capitalize(this._rawStatus);
    return'';
  }
  _stateColor(){
    const vs=this._optimisticState||this._vacuumState;
    const sensorColorMap={
      sweeping:'#43d17c',mapping:'#43d17c','go charging':'#ffb648',charging:'#18bcf2',charged:'#18bcf2',paused:'#ffb648',idle:'#18bcf2',
      working:'#43d17c',returning:'#ffb648',pausing:'#ffb648',standby:'#18bcf2','fully charged':'#18bcf2',
      multitaskstationworking:'#18bcf2',stationworking:'#18bcf2',multitaskrecharge:'#ffb648',washbreak:'#18bcf2',gowash:'#ffb648',
    };
    if(this._cleaningLocked&&vs==='paused')return'#ffb648';
    if(this._cleaningLocked)return'#43d17c';
    if(this._rawStatus&&sensorColorMap[this._rawStatus])return sensorColorMap[this._rawStatus];
    return{docked:'#18bcf2',cleaning:'#43d17c',returning:'#ffb648',paused:'#ffb648',idle:'#18bcf2',error:'#ff6b6b'}[this._vacuumState]||'#a7b3c2';
  }
  _isEditMode(){return new URLSearchParams(window.location.search).get('edit')==='1';}
  _updateEditMode(){this.classList.toggle('ha-edit-mode',this._isEditMode());}
  connectedCallback(){this._onUrlChange=()=>this._updateEditMode();window.addEventListener('popstate',this._onUrlChange);window.addEventListener('location-changed',this._onUrlChange);}
  disconnectedCallback(){window.removeEventListener('popstate',this._onUrlChange);window.removeEventListener('location-changed',this._onUrlChange);}
  async _loadCustomIcons(){try{const ri=await this._hass.callWS({type:'frontend/get_user_data',key:'xiaomi-robot-vacuum-card-icons'});this._customIcons=ri?.value||{};}catch(e){this._customIcons={};} try{const rn=await this._hass.callWS({type:'frontend/get_user_data',key:'xiaomi-robot-vacuum-card-names'});this._customNames=rn?.value||{};}catch(e){this._customNames={};} try{const cs=await this._hass.callWS({type:'frontend/get_user_data',key:'xiaomi-robot-vacuum-card-cleaning-state'});const st=cs?.value;if(st&&Array.isArray(st.rooms)&&st.lockedAt&&(Date.now()-st.lockedAt<90*60*1000)){this._selectedRooms=st.rooms;if(!this._cleaningLocked){this._cleaningLocked=true;this._cleaningLockedAt=st.lockedAt;this._sensorMode='detecting';this._detectionStartedAt=st.lockedAt;}}}catch(e){}this.render();}
  _saveIcon(id,icon){this._customIcons[id]=icon;this._hass.callWS({type:'frontend/set_user_data',key:'xiaomi-robot-vacuum-card-icons',value:this._customIcons});this.render();}
  _clearIcon(id){delete this._customIcons[id];this._hass.callWS({type:'frontend/set_user_data',key:'xiaomi-robot-vacuum-card-icons',value:this._customIcons});this.render();}  _saveName(id,name){if(name.trim())this._customNames[id]=name.trim();else delete this._customNames[id];this._hass.callWS({type:'frontend/set_user_data',key:'xiaomi-robot-vacuum-card-names',value:this._customNames});this.render();}
  _roomIconHtml(r){const c=this._customIcons[r.id];return`<ha-icon class="ribox-icon" icon="${c||r.icon}"></ha-icon>`;}
  _showIconPicker(id,name){
    const curIcon=this._customIcons[id]||'';
    const curName=this._customNames[id]||name;
    const modal=document.createElement('div');
    modal.className='icon-modal-bg';
    modal.innerHTML=`<div class="icon-modal">
      <h3>Edit room</h3>
      <p style="font-size:12px;color:var(--secondary-text-color,#6f7d8d);margin:0 0 14px;">${name}</p>
      <label style="display:block;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--secondary-text-color,#6f7d8d);margin-bottom:6px;">Display name</label>
      <div style="display:flex;gap:8px;margin-bottom:14px;">
        <input id="rni" type="text" value="${curName}" placeholder="${name}"
          style="flex:1;padding:10px 12px;font-size:14px;font-family:inherit;
          background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.18);
          border-radius:8px;color:var(--primary-text-color,#f5f8fc);outline:none;box-sizing:border-box;"/>
        <button id="save-name-btn" style="padding:10px 16px;border-radius:8px;border:none;
          background:var(--primary-color,#03a9f4);color:#fff;font-weight:700;font-size:13px;
          font-family:inherit;cursor:pointer;white-space:nowrap;">Save</button>
      </div>
      <label style="display:block;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--secondary-text-color,#6f7d8d);margin-bottom:6px;">Icon</label>
      <ha-icon-picker></ha-icon-picker>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button class="reset-btn" id="reset-name-btn">Reset name</button>
        <button class="reset-btn" id="reset-icon-btn">Reset icon</button>
      </div>
    </div>`;
    this.shadowRoot.appendChild(modal);
    const picker=modal.querySelector('ha-icon-picker');
    picker.value=curIcon;
    picker.hass=this._hass;
    // Close on background click
    modal.addEventListener('click',e=>{if(e.target===modal)this._hideIconPicker();});
    // Icon selection saves and closes
    picker.addEventListener('value-changed',e=>{if(e.detail.value){this._saveIcon(id,e.detail.value);this._hideIconPicker();}});
    // Name: Save button or Enter key
    const ni=modal.querySelector('#rni');
    const saveName=()=>{this._saveName(id,ni.value);this._hideIconPicker();};
    modal.querySelector('#save-name-btn').addEventListener('click',saveName);
    ni.addEventListener('keydown',e=>{if(e.key==='Enter')saveName();});
    // Reset buttons
    modal.querySelector('#reset-name-btn').addEventListener('click',()=>{this._saveName(id,'');this._hideIconPicker();});
    modal.querySelector('#reset-icon-btn').addEventListener('click',()=>{this._clearIcon(id);this._hideIconPicker();});
  }
  _hideIconPicker(){const m=this.shadowRoot.querySelector('.icon-modal-bg');if(m)m.remove();}
  toggleRoom(id){this._selectedRooms=this._selectedRooms.includes(id)?this._selectedRooms.filter(r=>r!==id):[...this._selectedRooms,id];this._updR();this._updS();}
  selectAll(){this._selectedRooms=this._rooms.map(r=>r.id);this._updR();this._updS();}
  selectNone(){this._selectedRooms=[];this._updR();this._updS();}
  _updR(){this.shadowRoot.querySelectorAll('.room').forEach(b=>b.classList.toggle('active',this._selectedRooms.includes(b.dataset.id)));}
  _updS(){const b=this.shadowRoot.querySelector('.start-btn');if(!b||this._running)return;const _ic=this._cleaningLocked||this._vacuumState==='cleaning'||this._vacuumState==='returning';const _camId=this._config.camera_entity||this._config.map_source?.camera_entity;const _tab=_camId?this._cleaningModeTab:'rooms';const _none=_tab==='rooms'?this._selectedRooms.length===0:this._selectedZones.length===0;b.disabled=_ic||_none;b.innerHTML=_ic?`<span class="spin">${this._svg('spn',24,'currentColor')}</span>&nbsp;Cleaning...`:`<ha-icon class="ctrl-icon" icon="mdi:play"></ha-icon>&nbsp;Start`;}
  _setOpt(type,value){
    if(type==='mode')this._cleanMode=value;
    else if(type==='fan')this._fanLevel=value;
    else if(type==='water')this._waterLevel=value;
    else if(type==='route')this._route=value;
    this.shadowRoot.querySelectorAll(`.opt[data-type="${type}"]`).forEach(b=>b.classList.toggle('active',b.dataset.value===value));
    const el=this.shadowRoot.querySelector(`.sv[data-type="${type}"]`);
    if(el)el.textContent=this._optLabel(value);
    if(type==='mode'){
      const mi=this._modeInt();
      const fs=this.shadowRoot.querySelector('[data-section="fan"]');
      const ws=this.shadowRoot.querySelector('[data-section="water"]');
      if(fs)fs.classList.toggle('disabled',mi===2);
      if(ws)ws.classList.toggle('disabled',mi===1);
    }
  }
  _optLabel(v){return({
    'Sweep':'Vacuuming','Mop':'Mopping','Sweep Mop':'Vac & Mop','Sweep Before Mopping':'Vac before Mop',
    'Vacuuming':'Vacuuming','Mopping':'Mopping','Vacuuming & Mopping':'Vac & Mop','Vacuuming before mopping':'Vac before Mop',
    'Silent':'Silent','Basic':'Standard','Standard':'Standard','Strong':'Strong','Full Speed':'Turbo','Turbo':'Turbo',
    'Off':'Off','Level1':'Level 1','Level2':'Level 2','Level3':'Level 3',
    'Quick':'Quick','Daily':'Standard','Careful':'Deep',
  })[v]||v;}
  _svc(s){this._hass.callService('vacuum',s,{entity_id:this._activeVc||this._E.vc});}
  async startCleaning(){
    if(this._selectedRooms.length===0||this._running||this._vacuumState==='cleaning'||this._vacuumState==='returning')return;
    this._running=true;
    const E=this._E;
    const avc=this._activeVc||E.vc;
    const btn=this.shadowRoot.querySelector('.start-btn');
    if(btn){btn.disabled=true;btn.innerHTML=`<span class="spin">${this._svg('spn',24,'currentColor')}</span>&nbsp;Starting...`;}
    try{
      if(E.mode){await this._hass.callService('select','select_option',{entity_id:E.mode,option:this._cleanMode});await new Promise(r=>setTimeout(r,2000));}
      if(E.fan){await this._hass.callService('select','select_option',{entity_id:E.fan,option:this._fanLevel});await new Promise(r=>setTimeout(r,1500));}
      if(E.water){await this._hass.callService('select','select_option',{entity_id:E.water,option:this._waterLevel});await new Promise(r=>setTimeout(r,1500));}
      if(E.route){await this._hass.callService('select','select_option',{entity_id:E.route,option:this._route});await new Promise(r=>setTimeout(r,1500));}
      const roomIds=this._selectedRooms.map(Number);
      if(this._config.camera_entity||this._config.map_source?.camera_entity){
        // xiaomi_cloud_map_extractor path: use MiOT action siid=2,aiid=16 (Start Vacuum Room Sweep)
        // params: piid=15 (Vacuum Room IDs) = JSON array string e.g. "[10,17]"
        await this._hass.callService('xiaomi_miot','call_action',{entity_id:avc,siid:2,aiid:16,params:['['+roomIds.join(',')+']']});
      } else {
        // xiaomi_miot S20+ native: configure each room then start
        for(const id of roomIds){
          const room=this._rooms.find(r=>r.id===String(id));
          await this._hass.callService('xiaomi_miot','call_action',{entity_id:avc,siid:2,aiid:10,params:[JSON.stringify({room_attrs:[{id,room_name:room?room.name:'',fan_level:this._fanInt(),water_level:this._waterInt(),clean_mode:this._modeInt(),clean_times:1,mop_mode:0,on:true}]})]});
          await new Promise(r=>setTimeout(r,1000));
        }
        await new Promise(r=>setTimeout(r,1000));
        await this._hass.callService('xiaomi_miot','call_action',{entity_id:avc,siid:2,aiid:13,params:[JSON.stringify({room:roomIds})]});
      }
      this._running=false;
      this._cleaningLocked=true;
      this._cleaningLockedAt=Date.now();
      this._lastAction=null;
      this._preCleanStatus=this._rawStatus;
      this._sensorMode='detecting';
      this._detectionStartedAt=Date.now();
      this._rawStatus='working';
      this._hass.callWS({type:'frontend/set_user_data',key:'xiaomi-robot-vacuum-card-cleaning-state',value:{rooms:this._selectedRooms,lockedAt:this._cleaningLockedAt}});
    }catch(e){console.error('[vacuum-card] startCleaning error:',e);this._running=false;}
    this.render();
  }
  _getCalibPts(){const camId=this._config.camera_entity||this._config.map_source?.camera_entity;if(!camId||!this._hass)return null;return this._hass.states[camId]?.attributes?.calibration_points||null;}
  _computeAffine(pts){
    if(!pts||pts.length<2)return null;
    let p=pts.slice(0,3);
    if(p.length===2){const dx=p[1].map.x-p[0].map.x,dy=p[1].map.y-p[0].map.y,dvx=p[1].vacuum.x-p[0].vacuum.x,dvy=p[1].vacuum.y-p[0].vacuum.y;p=[...p,{map:{x:p[0].map.x-dy,y:p[0].map.y+dx},vacuum:{x:p[0].vacuum.x-dvy,y:p[0].vacuum.y+dvx}}];}
    const[p0,p1,p2]=p;
    const[x1,y1,x2,y2,x3,y3]=[p0.map.x,p0.map.y,p1.map.x,p1.map.y,p2.map.x,p2.map.y];
    const[vx1,vy1,vx2,vy2,vx3,vy3]=[p0.vacuum.x,p0.vacuum.y,p1.vacuum.x,p1.vacuum.y,p2.vacuum.x,p2.vacuum.y];
    const det=x1*(y2-y3)+x2*(y3-y1)+x3*(y1-y2);
    if(Math.abs(det)<1e-10)return null;
    const a=(vx1*(y2-y3)+vx2*(y3-y1)+vx3*(y1-y2))/det,b=(x1*(vx2-vx3)+x2*(vx3-vx1)+x3*(vx1-vx2))/det,cc=(x1*(y2*vx3-y3*vx2)+x2*(y3*vx1-y1*vx3)+x3*(y1*vx2-y2*vx1))/det;
    const d=(vy1*(y2-y3)+vy2*(y3-y1)+vy3*(y1-y2))/det,e=(x1*(vy2-vy3)+x2*(vy3-vy1)+x3*(vy1-vy2))/det,f=(x1*(y2*vy3-y3*vy2)+x2*(y3*vy1-y1*vy3)+x3*(y1*vy2-y2*vy1))/det;
    return{a,b,c:cc,d,e,f};
  }
  _mapPxToVac(px,py,T){return{x:Math.round(T.a*px+T.b*py+T.c),y:Math.round(T.d*px+T.e*py+T.f)};}
  async startZoneCleaning(){
    if(this._selectedZones.length===0||this._running||this._vacuumState==='cleaning'||this._vacuumState==='returning')return;
    this._running=true;
    const E=this._E;const avc=this._activeVc||E.vc;
    const btn=this.shadowRoot.querySelector('.start-btn');
    if(btn){btn.disabled=true;btn.innerHTML=`<span class="spin">${this._svg('spn',24,'currentColor')}</span>&nbsp;Starting...`;}
    try{
      if(E.mode){await this._hass.callService('select','select_option',{entity_id:E.mode,option:this._cleanMode});await new Promise(r=>setTimeout(r,2000));}
      if(E.fan){await this._hass.callService('select','select_option',{entity_id:E.fan,option:this._fanLevel});await new Promise(r=>setTimeout(r,1500));}
      if(E.water){await this._hass.callService('select','select_option',{entity_id:E.water,option:this._waterLevel});await new Promise(r=>setTimeout(r,1500));}
      if(E.route){await this._hass.callService('select','select_option',{entity_id:E.route,option:this._route});await new Promise(r=>setTimeout(r,1500));}
      // OV21GL zone cleaning (miot-spec xiaomi-ov21gl):
      // 1. aiid=55 "Temporary Cleaning Zone" (siid=2) — defines zones via Common Params (piid=24)
      //    Params: JSON array of zone objects with 4-corner fb_point in mm
      // 2. aiid=9 "Start Custom Sweep" (siid=2) — starts cleaning the configured zones
      const zones=this._selectedZones.map((z,i)=>{
        const x1=Math.min(z.vac.x1,z.vac.x2),y1=Math.min(z.vac.y1,z.vac.y2),x2=Math.max(z.vac.x1,z.vac.x2),y2=Math.max(z.vac.y1,z.vac.y2);
        return{id:i,fb_attr:1,fb_point:[x1,y2,x1,y1,x2,y1,x2,y2],clean_times:1};
      });
      console.log('[vacuum-card] zone_clean aiid=55 zones:',JSON.stringify(zones));
      await this._hass.callService('xiaomi_miot','call_action',{entity_id:avc,siid:2,aiid:55,params:[JSON.stringify(zones)]});
      await new Promise(r=>setTimeout(r,1000));
      console.log('[vacuum-card] zone_clean aiid=9 (start custom sweep)');
      await this._hass.callService('xiaomi_miot','call_action',{entity_id:avc,siid:2,aiid:9,params:[]});
      this._running=false;
      this._cleaningLocked=true;this._cleaningLockedAt=Date.now();this._lastAction=null;
      this._sensorMode='detecting';this._detectionStartedAt=Date.now();this._rawStatus='working';
      this._hass.callWS({type:'frontend/set_user_data',key:'xiaomi-robot-vacuum-card-cleaning-state',value:{rooms:[],lockedAt:this._cleaningLockedAt}});
    }catch(e){console.error('[vacuum-card] startZoneCleaning error:',e);this._running=false;}
    this.render();
  }
  _removeZone(id){this._selectedZones=this._selectedZones.filter(z=>z.id!==id);const c=this.shadowRoot.querySelector('#zone-canvas');if(c)this._redrawZones(c);this._updZoneList();}
  _updZoneList(){
    const zl=this.shadowRoot.querySelector('.zone-list');if(!zl)return;
    if(this._selectedZones.length===0){zl.innerHTML='<div class="nr" style="padding:8px 0;font-size:12px;">Draw a rectangle on the map to add a zone</div>';}
    else{zl.innerHTML=this._selectedZones.map((z,i)=>`<div class="zone-item"><span>Zone ${i+1}</span><button class="zone-del" data-id="${z.id}">×</button></div>`).join('');zl.querySelectorAll('.zone-del').forEach(b=>b.addEventListener('click',()=>this._removeZone(Number(b.dataset.id))));}
    this._updS();
  }
  _redrawZones(canvas){
    const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
    const fs=Math.max(12,Math.min(canvas.width,canvas.height)*0.05);
    this._selectedZones.forEach((z,i)=>{
      const{x1,y1,x2,y2}=z.px;
      ctx.fillStyle='rgba(3,169,244,0.18)';ctx.strokeStyle='rgba(3,169,244,0.9)';ctx.lineWidth=Math.max(1,canvas.width*0.003);
      ctx.beginPath();ctx.rect(Math.min(x1,x2),Math.min(y1,y2),Math.abs(x2-x1),Math.abs(y2-y1));ctx.fill();ctx.stroke();
      ctx.fillStyle='rgba(3,169,244,0.95)';ctx.font=`bold ${fs}px system-ui`;ctx.fillText(i+1,Math.min(x1,x2)+4,Math.min(y1,y2)+fs+2);
    });
    if(this._zoneDrawing){
      const{x1,y1,x2,y2}=this._zoneDrawing;
      ctx.strokeStyle='rgba(255,255,255,0.8)';ctx.lineWidth=1;ctx.setLineDash([6,3]);
      ctx.strokeRect(Math.min(x1,x2),Math.min(y1,y2),Math.abs(x2-x1),Math.abs(y2-y1));ctx.setLineDash([]);
    }
  }
  _updateMapTransform(){const inner=this.shadowRoot.querySelector('#zone-inner');if(inner)inner.style.transform=`translate(${this._mapPan.x}px,${this._mapPan.y}px) scale(${this._mapZoom})`;}
  _zoomMap(d){this._mapZoom=Math.max(1,Math.min(5,Math.round((this._mapZoom+d)*10)/10));if(this._mapZoom===1)this._mapPan={x:0,y:0};this._updateMapTransform();}
  _setupZoneCanvas(){
    const canvas=this.shadowRoot.querySelector('#zone-canvas');const img=this.shadowRoot.querySelector('#zone-img');if(!canvas||!img)return;
    const calibPts=this._getCalibPts();const affine=calibPts?this._computeAffine(calibPts):null;
    const setup=()=>{canvas.width=img.naturalWidth||img.clientWidth||400;canvas.height=img.naturalHeight||img.clientHeight||400;this._redrawZones(canvas);};
    if(img.complete&&img.naturalWidth>0)setup();else img.addEventListener('load',setup,{once:true});
    const getPos=e=>{const rect=canvas.getBoundingClientRect();const t=e.touches?e.touches[0]:(e.changedTouches?e.changedTouches[0]:e);return{x:(t.clientX-rect.left)*canvas.width/rect.width,y:(t.clientY-rect.top)*canvas.height/rect.height};};
    const _finishZone=()=>{
      if(!this._zoneDrawing)return;
      const{x1,y1,x2,y2}=this._zoneDrawing;
      if(Math.abs(x2-x1)>20&&Math.abs(y2-y1)>20){
        const zone={id:Date.now(),px:{x1,y1,x2,y2}};
        if(affine){const v1=this._mapPxToVac(x1,y1,affine),v2=this._mapPxToVac(x2,y2,affine);zone.vac={x1:v1.x,y1:v1.y,x2:v2.x,y2:v2.y};console.log('[vacuum-card] zone drawn px:',JSON.stringify({x1,y1,x2,y2}),'→ vac mm:',JSON.stringify(zone.vac),'canvasSize:',canvas.width+'x'+canvas.height);}
        else{zone.vac={x1:Math.round(x1),y1:Math.round(y1),x2:Math.round(x2),y2:Math.round(y2)};console.warn('[vacuum-card] no calibration — using raw px as mm!');}
        this._selectedZones=[...this._selectedZones,zone];
      }
      this._zoneDrawing=null;this._redrawZones(canvas);this._updZoneList();
    };
    canvas.addEventListener('mousedown',e=>{e.preventDefault();const p=getPos(e);this._zoneDrawing={x1:p.x,y1:p.y,x2:p.x,y2:p.y};});
    canvas.addEventListener('mousemove',e=>{if(!this._zoneDrawing)return;const p=getPos(e);this._zoneDrawing.x2=p.x;this._zoneDrawing.y2=p.y;this._redrawZones(canvas);});
    canvas.addEventListener('mouseup',e=>{e.preventDefault();_finishZone();});
    // Touch: 1 finger = draw, 2 fingers = pan/pinch
    let _pt=null; // pan touch start state
    canvas.addEventListener('touchstart',e=>{
      e.preventDefault();
      if(e.touches.length===2){this._zoneDrawing=null;_pt={px:this._mapPan.x,py:this._mapPan.y,mx:(e.touches[0].clientX+e.touches[1].clientX)/2,my:(e.touches[0].clientY+e.touches[1].clientY)/2,dist:Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY),zoom:this._mapZoom};return;}
      const p=getPos(e);this._zoneDrawing={x1:p.x,y1:p.y,x2:p.x,y2:p.y};
    },{passive:false});
    canvas.addEventListener('touchmove',e=>{
      e.preventDefault();
      if(e.touches.length===2&&_pt){const mx=(e.touches[0].clientX+e.touches[1].clientX)/2,my=(e.touches[0].clientY+e.touches[1].clientY)/2;this._mapPan.x=_pt.px+(mx-_pt.mx);this._mapPan.y=_pt.py+(my-_pt.my);const dist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);this._mapZoom=Math.max(1,Math.min(5,_pt.zoom*dist/_pt.dist));this._updateMapTransform();return;}
      if(!this._zoneDrawing)return;
      const p=getPos(e);this._zoneDrawing.x2=p.x;this._zoneDrawing.y2=p.y;this._redrawZones(canvas);
    },{passive:false});
    canvas.addEventListener('touchend',e=>{e.preventDefault();if(_pt){_pt=null;this._zoneDrawing=null;return;}_finishZone();},{passive:false});
    // Zoom control buttons
    this.shadowRoot.querySelector('#zcenter')?.addEventListener('click',()=>{this._mapZoom=1;this._mapPan={x:0,y:0};this._updateMapTransform();});
    this.shadowRoot.querySelector('#zzout')?.addEventListener('click',()=>this._zoomMap(-0.5));
    this.shadowRoot.querySelector('#zzin')?.addEventListener('click',()=>this._zoomMap(0.5));
  }
  _optSec(type,label,opts,disabled=false){
    const cv=type==='mode'?this._cleanMode:type==='fan'?this._fanLevel:type==='water'?this._waterLevel:this._route;
    return`<div class="section${disabled?' disabled':''}" data-section="${type}"><div class="sh"><strong>${label}</strong><em class="sv" data-type="${type}">${this._optLabel(cv)}</em></div><div class="opts">${opts.map(o=>`<button class="opt${o.value===cv?' active':''}" data-type="${type}" data-value="${o.value}"><div class="circle">${this._cicon(o.icon)}</div><div>${o.label}</div></button>`).join('')}</div></div>`;
  }
  render(){
    this._rendered=true;this._updateEditMode();
    if(!this._E.vc){
      this.shadowRoot.innerHTML=`<ha-card style="padding:20px;color:#ff6b6b;font-family:system-ui;font-size:14px;line-height:1.8;">
      <b>xiaomi-robot-vacuum-card</b><br><br>
      Missing required config:<br>
      &bull; <code>entity</code> — MiOT vacuum entity (xiaomi_miot)<br>
      </ha-card>`;
      return;
    }
    const sc=this._stateColor();
    const bc=this._batteryColor();
    const batLabel=this._battery!==null?`${Math.round(this._battery)}%`:'?';
    const rawName=this._hass?.states[this._E.vc]?.attributes?.friendly_name||'Xiaomi S20+';
    const half=rawName.slice(0,rawName.length/2);
    const dedupedName=rawName===half+' '+half||rawName===half+half?half.trim():rawName;
    const title=this._config.title_mode==='custom'&&this._config.title?this._config.title:dedupedName;
    const _isCleaning=this._cleaningLocked||this._vacuumState==='cleaning'||this._vacuumState==='returning';
    const _camId=this._config.camera_entity||this._config.map_source?.camera_entity;
    const _activeTab=_camId?this._cleaningModeTab:'rooms';
    const _noneSelected=_activeTab==='rooms'?this._selectedRooms.length===0:this._selectedZones.length===0;
    const btnDisabled=_isCleaning||this._running||_noneSelected;
    const btnLabel=_isCleaning?`<span class="spin">${this._svg('spn',24,'currentColor')}</span>&nbsp;Cleaning...`:`<ha-icon class="ctrl-icon" icon="mdi:play"></ha-icon>&nbsp;Start`;
    const _om={
      'Sweep':{icon:'vac',label:'Vacuuming'},'Mop':{icon:'mop',label:'Mopping'},'Sweep Mop':{icon:'vacmop',label:'Vac & Mop'},'Sweep Before Mopping':{icon:'vacbmop',label:'Vac before Mop'},
      'Vacuuming':{icon:'vac',label:'Vacuuming'},'Mopping':{icon:'mop',label:'Mopping'},'Vacuuming & Mopping':{icon:'vacmop',label:'Vac & Mop'},'Vacuuming before mopping':{icon:'vacbmop',label:'Vac before Mop'},
      'Silent':{icon:'silent',label:'Silent'},'Basic':{icon:'standard',label:'Standard'},'Standard':{icon:'standard',label:'Standard'},'Strong':{icon:'strong',label:'Strong'},'Full Speed':{icon:'turbo',label:'Turbo'},'Turbo':{icon:'turbo',label:'Turbo'},
      'Off':{icon:'w0',label:'Off'},'Level1':{icon:'w1',label:'Level 1'},'Level2':{icon:'w2',label:'Level 2'},'Level3':{icon:'w3',label:'Level 3'},
      'Quick':{icon:'mdi:run-fast',label:'Quick'},'Daily':{icon:'mdi:walk',label:'Standard'},'Careful':{icon:'mdi:magnify-scan',label:'Deep'},
    };
    const _fb={icon:'spn',label:'?'};
    const _mOrder=['Vacuuming','Vacuuming & Mopping','Vacuuming before mopping','Mopping','Sweep','Sweep Mop','Sweep Before Mopping','Mop'];
    const mOpts=(this._modeOpts||['Vacuuming','Vacuuming & Mopping','Vacuuming before mopping','Mopping']).slice().sort((a,b)=>{const ai=_mOrder.indexOf(a),bi=_mOrder.indexOf(b);return(ai<0?99:ai)-(bi<0?99:bi);}).map(v=>({value:v,...(_om[v]||{..._fb,label:v})}));
    const fOpts=(this._fanOpts||['Silent','Standard','Strong','Turbo']).map(v=>({value:v,...(_om[v]||{..._fb,label:v})}));
    const wOpts=(this._waterOpts||['Off','Level1','Level2','Level3']).map(v=>({value:v,...(_om[v]||{..._fb,label:v})}));
    const _rOrder=['Quick','Daily','Careful'];
    const rOpts=(this._routeOpts||['Quick','Daily','Careful']).slice().sort((a,b)=>{const ai=_rOrder.indexOf(a),bi=_rOrder.indexOf(b);return(ai<0?99:ai)-(bi<0?99:bi);}).map(v=>({value:v,...(_om[v]||{..._fb,label:v})}));
    this.shadowRoot.innerHTML=`<style>
    :host{display:block;font-family:'Figtree',system-ui,sans-serif;}
    ha-card{
      background: var(--ha-card-background, var(--card-background-color, #fff));
      border: 1px solid var(--ha-card-border-color, var(--divider-color, rgba(0,0,0,0.12)));
      border-radius: var(--ha-card-border-radius, 24px);
      overflow: hidden;
      color: var(--primary-text-color, #212121);
      padding: 14px;
      box-sizing: border-box;
      box-shadow: var(--ha-card-box-shadow, none);
    }
    .hdr{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:14px;margin-bottom:12px;}
    h1{font-size:20px;font-weight:700;line-height:1.1;letter-spacing:-0.02em;text-align:center;margin:0;color:var(--primary-text-color, #212121);}
    .chip{padding:8px 13px;border-radius:999px;font-size:13px;font-weight:600;white-space:nowrap;border:1px solid;justify-self:end;}
    .warn-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;}
    .warn-chip{display:flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;font-size:12px;font-weight:600;background:rgba(255,80,80,0.12);border:1px solid rgba(255,80,80,0.35);color:#ff5050;animation:warn-pulse 1.4s ease-in-out infinite;}
    @keyframes warn-pulse{0%,100%{opacity:1;background:rgba(255,80,80,0.12);}50%{opacity:0.55;background:rgba(255,80,80,0.28);}}
    .bat{display:flex;align-items:center;gap:6px;font-size:15px;font-weight:700;}
    .bat-icon{--mdc-icon-size:20px;width:20px;height:20px;display:flex;filter:none;color:var(--primary-text-color, #212121);}
    .ctrl-icon{--mdc-icon-size:24px;width:24px;height:24px;display:flex;filter:none;color:var(--primary-text-color, #212121);}
    .icon-label{display:flex;flex-direction:column;align-items:center;gap:5px;}
    .icon-label span{font-size:11px;font-weight:600;letter-spacing:0.04em;opacity:0.85;color:var(--primary-text-color, #fff);}
    .section{margin-top:10px;} .section.disabled{opacity:0.35;pointer-events:none;transition:opacity 0.2s;}
    .consumables{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px;justify-content:center;}
    .cons-chip{display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid;}
    .sec-hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
    .sec-hd h2{font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:var(--secondary-text-color, #6f7d8d);margin:0;}
    .pills{display:flex;gap:8px;}
    .pill{
      padding:7px 14px;
      border-radius:999px;
      font-size:13px;
      font-weight:500;
      background: var(--ha-chip-background, rgba(0,0,0,0.04));
      border: 1px solid var(--ha-chip-border-color, var(--divider-color, rgba(0,0,0,0.08)));
      color: var(--secondary-text-color, #a7b3c2);
      cursor:pointer;font-family:inherit;transition:background 0.18s;
    }
    .pill:hover{filter:brightness(0.92);}
    .rooms{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-flow:dense;gap:10px;}
    .room{
      position:relative;min-height:72px;padding:10px 8px;border-radius:22px;overflow:hidden;
      background: var(--ha-room-background, linear-gradient(180deg,rgba(0,0,0,0.03),rgba(0,0,0,0.015)));
      border:1px solid var(--ha-room-border-color, var(--divider-color, rgba(0,0,0,0.06)));
      display:flex;flex-direction:column;justify-content:center;align-items:center;gap:6px;text-align:center;cursor:pointer;transition:all 0.18s;
      color: var(--secondary-text-color, #a7b3c2);
    }
    .room.active{
      background: var(--state-active-background, var(--primary-color, #03a9f4));
      border-color: var(--state-active-border-color, var(--primary-color, #03a9f4));
      box-shadow: 0 10px 28px var(--state-active-shadow, rgba(24,188,242,0.12));
      color: var(--primary-text-color, #fff);
    }
    .room.wide{grid-column:span 2;}
    .edit-icon{position:absolute;top:7px;right:7px;width:24px;height:24px;border-radius:8px;background:none;border:none;color:var(--disabled-text-color, rgba(0,0,0,0.4));cursor:pointer;display:grid;place-items:center;opacity:0;pointer-events:none;transition:all 0.18s;padding:0;}
    :host(.ha-edit-mode) .room:hover .edit-icon{opacity:1;pointer-events:auto;}
    .edit-icon:hover{background:var(--ha-edit-icon-hover-bg, rgba(0,0,0,0.1));color:var(--primary-text-color, #fff);}
    .ibox .ribox-icon{--mdc-icon-size:22px;width:22px;height:22px;display:flex;color:inherit;}
    .room.active .ibox .ribox-icon,
    .room.active ha-icon,
    .opt.active ha-icon,
    .opt.active .circle ha-icon,
    .opt.active .circle svg,
    .opt.active svg {
      color: var(--primary-text-color, #212121);
      fill: var(--primary-text-color, #212121);
      filter: none;
    }
    .icon-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,0.65);display:grid;place-items:center;z-index:999;}
    .icon-modal{background:var(--ha-card-background, #18212b);border-radius:20px;padding:20px;width:min(340px,90vw);border:1px solid var(--ha-card-border-color, rgba(255,255,255,0.1));overflow:visible;}
    .icon-modal h3{font-size:16px;font-weight:700;color:var(--primary-text-color, #f5f8fc);margin:0 0 4px;}
    .icon-modal p{font-size:12px;color:var(--secondary-text-color, #6f7d8d);margin:0 0 14px;}
    ha-icon-picker{display:block;width:100%;}
    .modal-footer{margin-top:14px;display:flex;justify-content:flex-end;}
    .reset-btn{padding:8px 16px;border-radius:999px;background:var(--ha-chip-background, rgba(0,0,0,0.05));border:1px solid var(--ha-chip-border-color, rgba(0,0,0,0.1));color:var(--secondary-text-color, #a7b3c2);font-size:13px;cursor:pointer;font-family:inherit;}
    .reset-btn:hover{filter:brightness(0.92);color:var(--primary-text-color, #f5f8fc);}
    .ibox{width:40px;height:40px;border-radius:14px;display:grid;place-items:center;background:var(--ha-chip-background, rgba(0,0,0,0.05));color:inherit;flex-shrink:0;transition:all 0.18s;}
    .room.active .ibox{background:var(--state-active-background, var(--primary-color, #03a9f4));border-color:transparent;box-shadow:0 8px 20px var(--state-active-shadow, rgba(24,188,242,0.35));color:var(--primary-text-color, #fff);}
    .rname{font-size:13px;font-weight:600;line-height:1.2;word-break:break-word;overflow-wrap:break-word;width:100%;}
    .sh{display:flex;align-items:baseline;gap:8px;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid var(--ha-divider-color, rgba(0,0,0,0.06));}
    .sh strong{font-size:17px;color:var(--primary-text-color, #f5f8fc);}
    .sh em{font-style:normal;color:var(--secondary-text-color, #a7b3c2);font-size:14px;}
    .opts{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;}
    .opt{display:grid;justify-items:center;gap:5px;text-align:center;cursor:pointer;background:none;border:none;color:var(--secondary-text-color, #a7b3c2);font-family:inherit;padding:2px 0;transition:color 0.18s;font-size:12px;}
    .opt.active{color:var(--primary-color, #03a9f4);font-weight:700;}
    .circle{width:50px;height:50px;border-radius:50%;display:grid;place-items:center;background:var(--ha-chip-background, rgba(0,0,0,0.04));border:1px solid var(--ha-chip-border-color, rgba(0,0,0,0.04));transition:all 0.18s;}
    .opt.active .circle{background:var(--state-active-background, var(--primary-color, #03a9f4));border-color:transparent;box-shadow:0 12px 28px var(--state-active-shadow, rgba(24,188,242,0.28));}
    ha-icon{--mdc-icon-size:27px;width:27px;height:27px;display:flex;color:var(--primary-text-color, #212121);filter:none;}
    .actions{display:flex;flex-direction:column;gap:8px;margin-top:10px;}
    .actions-top{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
    .btn{min-height:46px;border-radius:18px;border:1px solid var(--ha-chip-border-color, rgba(0,0,0,0.08));display:grid;place-items:center;background:var(--ha-chip-background, rgba(0,0,0,0.04));color:var(--primary-text-color, #f5f8fc);cursor:pointer;font-family:inherit;transition:all 0.18s;}
    .btn:hover:not(:disabled){filter:brightness(1.15);transform:translateY(-1px);}
    .btn:active:not(:disabled){transform:scale(0.93)!important;filter:brightness(0.75)!important;transition:all 0.06s;}
    .btn:disabled{opacity:0.4;cursor:not-allowed;}
    @keyframes btn-confirm{0%{filter:brightness(2)}100%{filter:brightness(1)}}
    .btn-confirm{animation:btn-confirm 0.4s ease-out;}
    .start-btn{display:flex;justify-content:center;gap:10px;background:var(--state-active-background, var(--primary-color, #03a9f4));border-color:var(--state-active-border-color, var(--primary-color, #03a9f4));color:var(--primary-text-color, #fff);font-weight:700;font-size:15px;font-family:inherit;}
    .pause-btn{background:var(--state-paused-background, var(--warning-color, #fff3cd));color:var(--warning-color, #ffb648);border-color:var(--state-paused-border-color, var(--warning-color, #ffb648));}
    .resume-btn{background:var(--state-on-background, var(--success-color, #d4edda));color:var(--success-color, #43d17c);border-color:var(--state-on-border-color, var(--success-color, #43d17c));}
    .stop-btn{background:var(--state-error-background, var(--error-color, #f8d7da));color:var(--error-color, #ff6b6b);border-color:var(--state-error-border-color, var(--error-color, #ff6b6b));}
    .home-btn{background:var(--state-home-background, var(--primary-color, #03a9f4));color:var(--primary-color, #8bdcff);border-color:var(--state-home-border-color, var(--primary-color, #8bdcff));}
    .pause-btn.btn-last{background:var(--state-paused-background-active, rgba(255,182,72,0.32));border-color:var(--state-paused-border-color-active, rgba(255,182,72,0.55));box-shadow:0 0 12px var(--state-paused-shadow, rgba(255,182,72,0.2));}
    .resume-btn.btn-last{background:var(--state-on-background-active, rgba(67,209,124,0.32));border-color:var(--state-on-border-color-active, rgba(67,209,124,0.55));box-shadow:0 0 12px var(--state-on-shadow, rgba(67,209,124,0.2));}
    .stop-btn.btn-last{background:var(--state-error-background-active, rgba(255,107,107,0.32));border-color:var(--state-error-border-color-active, rgba(255,107,107,0.55));box-shadow:0 0 12px var(--state-error-shadow, rgba(255,107,107,0.2));}
    .home-btn.btn-last{background:var(--state-home-background-active, rgba(24,188,242,0.2));border-color:var(--state-home-border-color-active, rgba(24,188,242,0.45));box-shadow:0 0 12px var(--state-home-shadow, rgba(24,188,242,0.15));}
    .nr{color:var(--secondary-text-color, #6f7d8d);font-size:14px;padding:20px 0;text-align:center;}
    @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
    .spin{display:inline-flex;animation:spin 0.8s linear infinite;}
    .pill.tab-active{background:var(--primary-color,#03a9f4);color:#fff;border-color:var(--primary-color,#03a9f4);}
    .zone-map-container{position:relative;margin-top:8px;border-radius:12px;overflow:hidden;line-height:0;background:#000;}
    .zone-map-inner{position:relative;transform-origin:center center;will-change:transform;}
    #zone-img{width:100%;display:block;}
    #zone-canvas{position:absolute;top:0;left:0;width:100%;height:100%;cursor:crosshair;touch-action:none;}
    .zone-controls{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:inline-flex;align-items:center;background:rgba(10,55,110,0.82);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-radius:999px;padding:4px 6px;gap:2px;z-index:10;box-shadow:0 4px 20px rgba(0,0,0,0.4);}
    .zone-ctrl-btn{background:none;border:none;cursor:pointer;color:rgba(200,230,255,0.92);width:34px;height:34px;display:grid;place-items:center;border-radius:999px;padding:0;transition:background 0.15s;flex-shrink:0;}
    .zone-ctrl-btn ha-icon{--mdc-icon-size:20px;width:20px;height:20px;color:inherit;}
    .zone-ctrl-btn.zc-fit{background:rgba(100,170,255,0.28);}
    .zone-ctrl-btn:hover{background:rgba(255,255,255,0.18);}
    .zone-list{margin-top:8px;display:flex;flex-direction:column;gap:6px;}
    .zone-item{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-radius:10px;background:var(--ha-chip-background,rgba(0,0,0,0.04));border:1px solid var(--ha-chip-border-color,rgba(0,0,0,0.08));font-size:13px;font-weight:600;color:var(--primary-color,#03a9f4);}
    .zone-del{background:none;border:none;color:var(--secondary-text-color,#a7b3c2);font-size:20px;line-height:1;cursor:pointer;padding:0 4px;font-family:inherit;}
    .zone-del:hover{color:var(--error-color,#ff6b6b);}
    </style>
    <ha-card>
    <div class="hdr">
    ${this._config.show_battery!==false&&this._battery!==null?`<div class="bat" style="color:${bc};"><ha-icon class="bat-icon" icon="${this._batteryIcon(this._battery)}"></ha-icon>&nbsp;${batLabel}</div>`:`<div></div>`}
    <h1>${title}</h1>
    ${(()=>{const sl=this._stateLabel();return this._config.show_status!==false&&sl?`<div class="chip" style="color:${sc};border-color:${sc}25;background:${sc}14;">${sl}</div>`:`<div></div>`;})()}
    </div>
    ${(()=>{const _a=this._hass?.states[this._activeVc||this._E.vc]?.attributes||{};let _ud={};try{const _raw=_a['custom.updata_difference'];_ud=typeof _raw==='string'?JSON.parse(_raw):(_raw&&typeof _raw==='object'?_raw:{});}catch(e){}const _df=_ud.differ||[];const _fids=_a['vacuum.fault_ids']||{};const _fl=Array.isArray(_fids.fault)?_fids.fault:(typeof _fids==='string'?JSON.parse(_fids).fault||[]:(_fids.fault||[]));const _we=(_a['vacuum.water_tank_status']>0)||(_a['vacuum.host_water_tank_status']>0)||_fl.includes(210030)||_a['vacuum.fault']===210030;const _sf=(_a['vacuum.sewage_tank_status']>0);if(!_we&&!_sf)return '';let _w='<div class="warn-chips">';if(_we)_w+='<div class="warn-chip"><ha-icon icon="mdi:water-off"></ha-icon>Clean water empty</div>';if(_sf)_w+='<div class="warn-chip"><ha-icon icon="mdi:bucket-outline"></ha-icon>Dirty water full</div>';return _w+'</div>';})()}
    ${(()=>{const t=_activeTab;return`<div class="section${_isCleaning?' disabled':''}" style="margin-top:0">
    <div class="sec-hd">
    <div class="pills">${_camId?`<button class="pill${t==='rooms'?' tab-active':''}" id="tab-rooms">Rooms</button><button class="pill${t==='zones'?' tab-active':''}" id="tab-zones">Zones</button>`:'<h2 style="margin:0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:var(--secondary-text-color,#6f7d8d);">Rooms</h2>'}</div>
    ${t==='rooms'?'<div class="pills"><button class="pill" id="ab">All</button><button class="pill" id="nb">Clear</button></div>':''}
    </div>
    ${t==='rooms'
      ?(this._rooms.length===0?`<div class="nr">Loading rooms...</div>`:`<div class="rooms">${this._rooms.map(r=>`<div class="room${this._selectedRooms.includes(r.id)?' active':''}${(this._customNames[r.id]||r.name).length>9?' wide':''}" role="button" data-id="${r.id}"><button class="edit-icon" data-id="${r.id}">${this._svg('pen',13,'currentColor')}</button><div class="ibox">${this._roomIconHtml(r)}</div><div class="rname">${this._customNames[r.id]||r.name}</div></div>`).join('')}</div>`)
      :(_camId?(()=>{const _ep=this._hass.states[_camId]?.attributes?.entity_picture||'/api/camera_proxy/'+_camId;const _ctl=`<div class="zone-controls"><button class="zone-ctrl-btn zc-fit" id="zcenter" title="Fit to view"><ha-icon icon="mdi:crop-free"></ha-icon></button><button class="zone-ctrl-btn" id="zzout" title="Zoom out"><ha-icon icon="mdi:magnify-minus-outline"></ha-icon></button><button class="zone-ctrl-btn" id="zzin" title="Zoom in"><ha-icon icon="mdi:magnify-plus-outline"></ha-icon></button></div>`;return`<div class="zone-map-container"><div id="zone-inner" class="zone-map-inner" style="transform:translate(${this._mapPan.x}px,${this._mapPan.y}px) scale(${this._mapZoom});"><img id="zone-img" src="${_ep}" /><canvas id="zone-canvas"></canvas></div>${_ctl}</div><div class="zone-list">${this._selectedZones.length===0?'<div class="nr" style="padding:8px 0;font-size:12px;">Draw a rectangle on the map to add a zone</div>':this._selectedZones.map((z,i)=>`<div class="zone-item"><span>Zone ${i+1}</span><button class="zone-del" data-id="${z.id}">×</button></div>`).join('')}</div>`;})():'<div class="nr">No map entity configured</div>')
    }
    </div>`;})()}
    ${this._E.mode?this._optSec('mode','Mode',mOpts,_isCleaning):''}
    ${this._E.fan?this._optSec('fan','Suction',fOpts,_isCleaning||this._modeInt()===2):''}
    ${this._E.water?this._optSec('water','Water output',wOpts,_isCleaning||this._modeInt()===1):''}
    ${this._E.route?this._optSec('route','Route',rOpts,_isCleaning):''}
    <div class="actions">
    ${(()=>{const _va=this._hass?.states[this._activeVc||this._E.vc]?.attributes||{};const _cons=[{icon:"mdi:delete-variant",label:"Dust bag",pct:_va["dust_bag.dust_bag_life_level"]},{icon:"mdi:brush",label:"Main brush",pct:_va["brush_cleaner.brush_life_level"]},{icon:"mdi:brush",label:"Side brush",pct:_va["brush_life_level-13-1"]},{icon:"mdi:air-filter",label:"Filter",pct:_va["filter.filter_life_level"]},{icon:"mdi:water",label:"Mop",pct:_va["mop.mop_life_level"]},].filter(c=>c.pct!=null);if(!_cons.length)return '';const _cc=p=>p<20?'#ff5050':p<50?'#ffb648':'var(--secondary-text-color,#6f7d8d)';return '<div class="consumables">'+_cons.map(c=>{const col=_cc(c.pct);return `<div class="cons-chip" style="color:${col};border-color:${col}40;background:${col}12;"><ha-icon icon="${c.icon}" style="--mdc-icon-size:14px;width:14px;height:14px;display:flex;"></ha-icon>${c.label} ${c.pct}%</div>`;}).join('')+ '</div>';})()}
    ${(()=>{const _vs=this._vacuumState;const _lk=this._cleaningLocked;const _va=this._hass?.states[this._activeVc||this._E.vc]?.attributes||{};const _atBase=_vs==='docked'||(_vs==='idle'&&(_va['battery.charging_state']===1||/charg/i.test(_va['vacuum.status_desc']||'')));const _cl=_vs==='cleaning'||_lk;const _pa=_vs==='paused';const _re=_vs==='returning';const _er=_vs==='error';const _id=_vs==='idle'&&!_atBase;const canPauseResume=_cl||_pa;const canStop=_cl||_pa||_re||_er;const canHome=_cl||_pa||_id||_er;const _d=v=>v?'':' disabled';const _pr=_pa?{icon:'mdi:play',label:'Resume',cls:'resume-btn',act:'resume'}:{icon:'mdi:pause',label:'Pause',cls:'pause-btn',act:'pause'};return`<div class="actions-top">
    <button class="btn ${_pr.cls}${this._lastAction===_pr.act?' btn-last':''}"${_d(canPauseResume)} id="cpa" title="${_pr.label}"><div class="icon-label"><ha-icon class="ctrl-icon" icon="${_pr.icon}"></ha-icon><span>${_pr.label}</span></div></button>
    <button class="btn stop-btn${this._lastAction==='stop'?' btn-last':''}"${_d(canStop)} id="cs" title="Stop"><div class="icon-label"><ha-icon class="ctrl-icon" icon="mdi:stop"></ha-icon><span>Stop</span></div></button>
    <button class="btn home-btn${this._lastAction==='home'?' btn-last':''}"${_d(canHome)} id="ch" title="Return home"><div class="icon-label"><ha-icon class="ctrl-icon" icon="mdi:home"></ha-icon><span>Home</span></div></button>
    </div>`;})()}
    <button class="btn start-btn"${btnDisabled?' disabled':''}>${btnLabel}</button>
    </div>
    </ha-card>`;
    this.shadowRoot.querySelectorAll('.room').forEach(el=>el.addEventListener('click',()=>this.toggleRoom(el.dataset.id)));
    this.shadowRoot.querySelectorAll('.edit-icon').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();this._showIconPicker(b.dataset.id,this._rooms.find(r=>r.id===b.dataset.id)?.name||'');}));
    this.shadowRoot.querySelector('#ab')?.addEventListener('click',()=>this.selectAll());
    this.shadowRoot.querySelector('#nb')?.addEventListener('click',()=>this.selectNone());
    this.shadowRoot.querySelector('#tab-rooms')?.addEventListener('click',()=>{this._cleaningModeTab='rooms';this._selectedZones=[];this._mapZoom=1;this._mapPan={x:0,y:0};this.render();});
    this.shadowRoot.querySelector('#tab-zones')?.addEventListener('click',()=>{this._cleaningModeTab='zones';this.render();});
    this.shadowRoot.querySelectorAll('.zone-del').forEach(b=>b.addEventListener('click',()=>this._removeZone(Number(b.dataset.id))));
    this.shadowRoot.querySelectorAll('.opt').forEach(b=>b.addEventListener('click',()=>this._setOpt(b.dataset.type,b.dataset.value)));
    this.shadowRoot.querySelector('.start-btn').addEventListener('click',()=>_activeTab==='rooms'?this.startCleaning():this.startZoneCleaning());
    if(_activeTab==='zones')this._setupZoneCanvas();
    const _flash=id=>{const b=this.shadowRoot.querySelector(id);if(b){b.classList.add('btn-confirm');setTimeout(()=>b?.classList.remove('btn-confirm'),400);}};
    this.shadowRoot.querySelector('#cpa').addEventListener('click',()=>{const isPaused=this._vacuumState==='paused';if(isPaused){this._lastAction='resume';this._svc('start');this._optimisticState='cleaning';}else{this._lastAction='pause';this._svc('pause');this._optimisticState='paused';}this.render();_flash('#cpa');});
    this.shadowRoot.querySelector('#cs').addEventListener('click',()=>{this._lastAction='stop';this._svc('stop');this._cleaningLocked=false;this._sensorMode='unknown';this._optimisticState=null;this.render();_flash('#cs');});
    this.shadowRoot.querySelector('#ch').addEventListener('click',()=>{this._lastAction='home';this._svc('return_to_base');this._cleaningLocked=false;this._sensorMode='unknown';this._optimisticState='returning';this.render();_flash('#ch');setTimeout(()=>{if(this._lastAction==='home'){this._lastAction=null;this.render();}},3000);});
  }
  getCardSize(){return 8;}
  static getConfigElement(){return document.createElement('xiaomi-robot-vacuum-card-editor');}
  static getStubConfig(){
    return{entity:'vacuum.your_vacuum_robot_cleaner'};
  }
}
class XiaomiS20PlusVacuumCardV3Editor extends HTMLElement {
  constructor(){super();this._config={};this._titleMode='auto';}
  set hass(h){
    this._hass=h;
    const form=this.querySelector('#config-form');
    if(form)form.hass=h;
  }
  setConfig(c){
    this._config={...c};
    this._titleMode=c.title_mode==='custom'?'custom':'auto';
    if(this._typing)return;
    const form=this.querySelector('#config-form');
    if(form){form.data={...this._config};return;}
    this._render();
  }
  _fire(){
    this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...this._config}},bubbles:true,composed:true}));
  }
  _setKey(key,value){
    if(value||value==='')this._config[key]=value;else delete this._config[key];
    this._fire();
  }
  _switchMode(mode){
    this._titleMode=mode;
    if(mode==='auto')delete this._config.title_mode;
    else this._config.title_mode='custom';
    this._fire();
    this._render();
  }
  _render(){
    const isCustom=this._titleMode==='custom';
    const btnBase='padding:5px 14px;font-size:12px;border:none;cursor:pointer;font-family:inherit;transition:background 0.15s,color 0.15s;';
    const btnAuto=btnBase+(isCustom?'background:transparent;color:#a7b3c2;':'background:#18bcf2;color:#fff;');
    const btnCustom=btnBase+(!isCustom?'background:transparent;color:#a7b3c2;':'background:#18bcf2;color:#fff;');
    this.innerHTML=`<div style="display:flex;flex-direction:column;gap:14px;padding:4px 0">
    <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="font-size:14px;color:#f5f8fc;font-weight:500;">Title</span>
    <div style="display:flex;border:1px solid rgba(255,255,255,0.15);border-radius:8px;overflow:hidden;">
    <button id="btn-auto" style="${btnAuto}">Auto</button>
    <button id="btn-custom" style="${btnCustom}">Custom</button>
    </div>
    </div>
    ${isCustom
      ?`<input id="title-input" type="text" placeholder="e.g. My Vacuum" style="display:block;width:100%;box-sizing:border-box;padding:12px 16px;font-size:14px;font-family:inherit;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.18);border-radius:8px;color:#f5f8fc;outline:none;" />`
      :`<div style="font-size:12px;color:#a7b3c2;padding:2px 2px;">Uses the vacuum's friendly name from Home Assistant.</div>`
    }
    </div>
    <ha-form id="config-form"></ha-form>
    </div>`;
    this.querySelector('#btn-auto').addEventListener('click',()=>this._switchMode('auto'));
    this.querySelector('#btn-custom').addEventListener('click',()=>this._switchMode('custom'));
    if(isCustom){
      const ti=this.querySelector('#title-input');
      ti.value=this._config.title||'';
      ti.addEventListener('focus',()=>this._typing=true);
      ti.addEventListener('blur',()=>this._typing=false);
      ti.addEventListener('input',e=>{this._config.title=e.target.value;this._fire();});
    }
    const form=this.querySelector('#config-form');
    form.hass=this._hass;
    form.data={...this._config,show_battery:this._config.show_battery!==false,show_status:this._config.show_status!==false};
    form.schema=[];
    form.computeLabel=s=>s.name;
    form.addEventListener('value-changed',e=>{
      this._config={...this._config,...e.detail.value};
      this._fire();
    });
  }
}
if(!customElements.get('xiaomi-robot-vacuum-card-editor')){
  customElements.define('xiaomi-robot-vacuum-card-editor',XiaomiS20PlusVacuumCardV3Editor);
}
if(!customElements.get('xiaomi-robot-vacuum-card')){
  customElements.define('xiaomi-robot-vacuum-card',XiaomiS20PlusVacuumCardV3);
}
window.customCards=window.customCards||[];
if(!window.customCards.find(c=>c.type==='xiaomi-robot-vacuum-card')){
  window.customCards.push({type:'xiaomi-robot-vacuum-card',name:'Xiaomi Robot Vacuum S20+ Card',description:'Room-by-room control card for Xiaomi S20+ via xiaomi_miot integration.',version:CARD_VERSION,preview:true});
}
