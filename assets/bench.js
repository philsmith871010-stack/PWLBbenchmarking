// PWLB benchmarking: an authority's treasury portfolio, pasted from Excel, against its peers.
// Balances and the PWLB loan book are published; the rest of the peer set is illustrative until
// the pool has contributors, and every panel says which it is. Nothing leaves the browser.
(function(){
  'use strict';
  var CP_URL='https://philsmith871010-stack.github.io/bankCredit/data/policy.json';
  var RATES_URL='https://pwlbtoday.org/api/data/';
  var TODAY=new Date(); TODAY.setHours(0,0,0,0);
  var D={peers:null,loans:null,cp:null,curves:null,pred:null};
  var S={auth:null,group:'',rows:[],names:[],matches:{},deals:{},confirmed:false};
  function dealsMemory(){try{return JSON.parse(localStorage.getItem('pwlb.bench.deals')||'{}')}catch(e){return{}}}
  var $=function(id){return document.getElementById(id)};
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function json(u){return fetch(u).then(function(r){if(!r.ok)throw new Error(u);return r.json()})}
  function fmtM(v){return v==null?'—':(Math.abs(v)>=1000?(v/1000).toFixed(2)+'bn':v.toFixed(1)+'m')}
  function pct(v,dp){return v==null?'—':v.toFixed(dp==null?1:dp)+'%'}
  function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function days(a,b){return Math.round((b-a)/864e5)}
  function median(a){if(!a.length)return null;var s=a.slice().sort(function(x,y){return x-y}),n=s.length;return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2}
  function q(a,p){if(!a.length)return null;var s=a.slice().sort(function(x,y){return x-y}),i=(s.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return s[lo]+(s[hi]-s[lo])*(i-lo)}
  function stats(a){return a.length?{n:a.length,med:median(a),p25:q(a,.25),p75:q(a,.75)}:null}
  function hash(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0)/4294967296}

  // ---- dates and numbers as Excel writes them
  function parseDate(s){
    s=String(s||'').trim(); if(!s)return null;
    var m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if(m)return new Date(+m[1],+m[2]-1,+m[3]);
    m=s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/); if(m){var y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
    m=s.match(/^(\d{1,2})[ \-]([A-Za-z]{3})[a-z]*[ \-](\d{2,4})$/); if(m){var mo=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[2].toLowerCase().slice(0,3));if(mo>=0){var yy=+m[3];if(yy<100)yy+=2000;return new Date(yy,mo,+m[1])}}
    return null;
  }
  function parseNum(s){s=String(s||'').replace(/[£$,\s]/g,'').replace(/%$/,'');if(s===''||isNaN(+s))return null;return +s}
  function isDate(s){return parseDate(s)!=null}
  function isAmount(s){var v=parseNum(s);return v!=null&&Math.abs(v)>=1000}
  function isRate(s){var v=parseNum(s);return v!=null&&v>=0&&v<25&&(/%/.test(s)||/\./.test(s)||v<25)}
  var PROFILES=/^(maturity|annuity|eip|equal instalments?( of principal)?|bullet)$/i;
  var TYPEW=/deposit|notice|call|mmf|money market|fund|loan|lobo|borrow|pwlb|gilt|bill|bond|cd\b|certificate/i;

  // ---- the paste: rows of cells, the columns read from what they hold
  function parsePaste(text){
    var lines=text.replace(/\r/g,'').split('\n').filter(function(l){return l.trim()});
    if(!lines.length)return {rows:[],cols:null};
    var sep=lines[0].indexOf('\t')>=0?'\t':(lines[0].split(';').length>2?';':',');
    var grid=lines.map(function(l){return l.split(sep).map(function(c){return c.trim().replace(/^"|"$/g,'')})});
    var w=Math.max.apply(null,grid.map(function(r){return r.length}));
    var head=grid[0], hasHead=!head.some(isAmount)&&!head.some(isDate);
    var body=hasHead?grid.slice(1):grid;
    var H={name:/counterpart|name|bank|borrower|lender|institution|fund/i,amount:/amount|principal|nominal|value|sum|balance|£/i,rate:/rate|coupon|yield|interest/i,
           type:/type|instrument|product|category|kind/i,start:/start|from|deal|trade|value date|issue/i,end:/end|matur|to date|repay|redemption/i,profile:/profile|method|repayment|structure/i};
    var cols={};
    if(hasHead)head.forEach(function(h,i){for(var k in H)if(cols[k]==null&&H[k].test(h)){cols[k]=i;break}});
    // then by contents, for anything the headings did not settle
    var col=function(i){return body.map(function(r){return r[i]||''})};
    var score=function(i,f){var c=col(i).filter(Boolean);return c.length?c.filter(f).length/c.length:0};
    var taken=function(i){for(var k in cols)if(cols[k]===i)return true;return false};
    var want=[['profile',function(s){return PROFILES.test(s)}],['start',isDate],['end',isDate],['amount',isAmount],['rate',isRate],['type',function(s){return TYPEW.test(s)&&!isAmount(s)}],['name',function(s){return /[A-Za-z]{3}/.test(s)&&!isAmount(s)&&!isDate(s)}]];
    want.forEach(function(wv){if(cols[wv[0]]!=null)return;var best=-1,bs=0.55;for(var i=0;i<w;i++){if(taken(i))continue;var sc=score(i,wv[1]);if(wv[0]==='end'&&cols.start===i)continue;if(sc>bs){bs=sc;best=i}}if(best>=0)cols[wv[0]]=best});
    if(cols.start!=null&&cols.end==null){for(var i=0;i<w;i++)if(!taken(i)&&score(i,isDate)>0.3){cols.end=i;break}}
    var rows=body.map(function(r,n){
      var type=cols.type!=null?r[cols.type]||'':'';
      var side=/borrow|lobo|pwlb|market loan|loan from|lender/i.test(type)?'borrowing':'investment';
      return {n:n+1,name:cols.name!=null?r[cols.name]||'':'',amount:cols.amount!=null?parseNum(r[cols.amount]):null,rate:cols.rate!=null?parseNum(r[cols.rate]):null,
              type:type,start:cols.start!=null?parseDate(r[cols.start]):null,end:cols.end!=null?parseDate(r[cols.end]):null,
              profile:cols.profile!=null?String(r[cols.profile]||'').toUpperCase():'',side:side};
    }).filter(function(r){return r.name&&r.amount});
    rows.forEach(function(r){if(r.rate!=null&&r.rate<1&&r.rate>0&&!/%/.test(String(r.rate)))r.rate=r.rate*100>25?r.rate:r.rate*100});
    return {rows:rows,cols:cols,hasHead:hasHead};
  }

  // ---- what a name is: a bank on the master list, a fund, the DMADF, another authority
  var ALIAS={'natwest':'natwest-bank','national westminster':'natwest-bank','nationwide':'nationwide','santander':'santander-uk','barclays':'barclays-bank-uk','lloyds':'lloyds-bank',
             'hsbc':'hsbc-uk','handelsbanken':'handelsbanken-plc','goldman':'goldman-sachs-international-bank','standard chartered':'standard-chartered','close brothers':'close-brothers',
             'toronto dominion':'td-bank','td bank':'td-bank','anz':'anz','australia and new zealand':'anz','bank of scotland':'bank-of-scotland','halifax':'bank-of-scotland',
             'coventry':'coventry-bs','skipton':'skipton-bs','leeds':'leeds-bs','yorkshire':'yorkshire-bs','principality':'principality-bs','nottingham':'nottingham-bs','west brom':'west-brom-bs',
             'rabobank':'rabobank','dbs':'dbs','ocbc':'ocbc','uob':'uob','commonwealth bank':'commonwealth-bank','westpac':'westpac','nab':'nab','national australia':'nab','sumitomo':'smbc-bank-international',
             'jpmorgan':'jpmorgan-chase-bank','jp morgan':'jpmorgan-chase-bank','citi':'citibank','bank of america':'bank-of-america-na','wells fargo':'wells-fargo-bank','morgan stanley':'morgan-stanley-bank',
             'bny':'bank-of-new-york-mellon','state street':'state-street-bank','northern trust':'northern-trust-company','first abu dhabi':'first-abu-dhabi-bank','qnb':'qnb','al rayan':'al-rayan-bank',
             'nordea':'nordea','seb':'seb','svenska':'svenska-handelsbanken','swedbank':'swedbank','danske':'danske-bank','dnb':'dnb','bng':'bng-bank','nwb':'nwb-bank','ing':'ing','abn':'abn-amro',
             'bnp':'bnp-paribas','societe generale':'societe-generale','credit agricole':'credit-agricole','deutsche':'deutsche-bank','commerzbank':'commerzbank','unicredit':'unicredit','intesa':'intesa-sanpaolo',
             'bbva':'bbva','caixa':'caixabank','landesbank baden':'lbbw','helaba':'helaba','bayern':'bayernlb','nord':'nord-lb','dz bank':'dz-bank','kbc':'kbc','belfius':'belfius','erste':'erste-group',
             'ubs':'ubs','royal bank of canada':'rbc','rbc':'rbc','scotia':'scotiabank','nova scotia':'scotiabank','cibc':'cibc','bank of montreal':'bmo','bmo':'bmo','national bank of canada':'national-bank-of-canada',
             'aldermore':'aldermore','shawbrook':'shawbrook','paragon':'paragon','osb':'osb-group','onesavings':'osb-group','metro':'metro-bank','monzo':'monzo','starling':'starling','tsb':'tsb',
             'virgin money':'clydesdale-bank','clydesdale':'clydesdale-bank','co-operative':'co-operative-bank','cooperative bank':'co-operative-bank','investec':'investec','al rajhi':'al-rajhi-bank','emirates nbd':'emirates-nbd','adcb':'adcb','saudi national':'saudi-national-bank'};
  function norm(s){return String(s||'').toLowerCase().replace(/&/g,' and ').replace(/\b(plc|p\.l\.c\.|limited|ltd|the|of|corporation|n\.a\.|na|sa|ag|nv|n\.v\.|s\.a\.|building society|bs)\b/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()}
  // an authority's name without the words every authority carries
  function laNorm(s){return norm(s).replace(/\b(council|county|borough|london|city|of|district|metropolitan|royal|unitary|authority|combined|ua|mbc|dc|bc|cc|lb|rb)\b/g,' ').replace(/\s+/g,' ').trim()}
  function kind(name){
    var n=name.toLowerCase();
    if(/dmadf|dmo\b|debt management/.test(n))return 'dmadf';
    if(/\bmmf\b|money market|liquidity|sterling prime|cash fund|deposit fund|liquid fund/.test(n))return 'mmf';
    if(/property|lamit|pooled|diversified|multi.?asset|strategic bond|equity|income fund|investment fund/.test(n))return 'funds';
    if(/treasury bill|gilt|\bt-?bill/.test(n))return 'gov';
    if(/council|borough|authority|county|district|city of|\bua\b|\bcc\b|\bdc\b|\bbc\b|\bmbc\b/.test(n))return 'la';
    return null;
  }
  function tokens(s){return norm(s).split(' ').filter(Boolean)}
  function similarity(a,b){var ta=tokens(a),tb=tokens(b);if(!ta.length||!tb.length)return 0;var inter=ta.filter(function(t){return tb.indexOf(t)>=0}).length;var j=inter/(ta.length+tb.length-inter);if(norm(a)===norm(b))return 1;if(norm(b).indexOf(norm(a))===0||norm(a).indexOf(norm(b))===0)j=Math.max(j,0.8);return j}
  function candidates(name){
    var k=kind(name), out=[];
    var n=norm(name);
    // an exact name on the master list first, then a known alias, then anything that looks alike
    D.cp.rows.forEach(function(r){var s=Math.max(similarity(name,r.short),similarity(name,r.name));if(s>=0.4)out.push({id:r.id,label:r.short+' · '+r.name,score:s>=0.99?1:Math.min(s,0.9),kind:'bank'})});
    for(var a in ALIAS){if(n===a||n.indexOf(a+' ')===0||(' '+n+' ').indexOf(' '+a+' ')>=0){var r=D.cp.byId[ALIAS[a]];if(r&&!out.some(function(o){return o.id===r.id&&o.score>=1})){out=out.filter(function(o){return o.id!==r.id});out.push({id:r.id,label:r.short+' · '+r.name,score:0.95,kind:'bank'})}}}
    if(k==='la'||!out.length){var ln=laNorm(name);D.peers.authorities.forEach(function(a){var an=laNorm(a.name);var s=an&&ln===an?1:Math.max(similarity(name,a.name),an&&ln.indexOf(an)===0?0.85:0);if(s>=0.5)out.push({id:'la:'+a.code,label:a.name+' (local authority)',score:s,kind:'la'})})}
    out.sort(function(x,y){return y.score-x.score});
    out=out.slice(0,6);
    if(k&&k!=='la')out.unshift({id:'class:'+k,label:CLASS_LABEL[k],score:0.99,kind:k});
    else if(k==='la'&&!out.some(function(o){return o.kind==='la'}))out.unshift({id:'class:la',label:'Another local authority',score:0.9,kind:'la'});
    return out;
  }
  // A class that is not a bank still has a standing: the DMADF is HM Treasury, gilts are the
  // sovereign, another authority is a statutory body that cannot default in the ordinary way,
  // and a sterling MMF is triple-A rated by construction. Pooled funds carry market risk, not
  // credit risk, and are not scored.
  var CLASS_SCORE={dmadf:{score:95,band:'A',rating:'AA-',label:'DMADF (HM Treasury)'},gov:{score:95,band:'A',rating:'AA-',label:'Gilts and Treasury bills'},la:{score:90,band:'A',rating:'\u2014',label:'Local authority'},mmf:{score:88,band:'A',rating:'AAA',label:'Money market fund'}};
  var CLASS_LABEL={mmf:'Money market fund',dmadf:'DMADF (Debt Management Office)',funds:'Pooled or property fund',gov:'Gilts and Treasury bills',la:'Another local authority',lender:'Lender to you, not a deposit counterparty',other:'Other, not on the master list'};
  function memory(){try{return JSON.parse(localStorage.getItem('pwlb.bench.matches')||'{}')}catch(e){return{}}}
  function remember(m){try{localStorage.setItem('pwlb.bench.matches',JSON.stringify(m))}catch(e){}}

  // ---- the loan-by-loan projection, as the PWLBtoday loan analysis does it: half-yearly coupons
  // counted back from maturity, EIP in equal principal, annuity as a level payment at rate/2
  function addMonths(d,n){var x=new Date(d);var day=x.getDate();x.setDate(1);x.setMonth(x.getMonth()+n);var last=new Date(x.getFullYear(),x.getMonth()+1,0).getDate();x.setDate(Math.min(day,last));return x}
  function coupons(start,mat,step){var out=[],cur=new Date(mat),guard=0;while(cur>start&&guard++<800){out.unshift(new Date(cur));cur=addMonths(cur,-(step||6))}if(!out.length||out[0]>start)out.unshift(new Date(start));return out}
  // A bespoke loan may pay interest only for a while and then amortise, and may pay quarterly or
  // annually: the amortisation runs from the end of the interest-only period on its own frequency.
  function outstanding(loan,at){
    if(at<loan.start||at>=loan.maturity)return 0;
    if(loan.method==='MATURITY')return loan.principal;
    var from=loan.io&&loan.io>loan.start?loan.io:loan.start;
    if(at<from)return loan.principal;
    var cs=coupons(from,loan.maturity,loan.freq||6),full=cs.length-1;if(full<1)return loan.principal;
    var paid=cs.filter(function(c){return c<=at}).length;
    if(loan.method==='EIP')return Math.max(0,loan.principal-loan.principal/full*(paid-1));
    var r=loan.rate/100*(loan.freq||6)/12,pmt=(r*loan.principal)/(1-Math.pow(1+r,-full)),rem=loan.principal;
    for(var p=1;p<paid;p++){rem-=pmt-rem*r}
    return Math.max(0,rem);
  }
  // "interest only until Sep 2031" means the first instalment falls after that month
  function monthEnd(ym){var m=String(ym||'').match(/^(\d{4})-(\d{2})/);return m?new Date(+m[1],+m[2],0):parseDate(ym)}
  function monthLabel(ym){var d=monthEnd(ym);return d?['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]+' '+d.getFullYear():''}
  function loanObj(l){return {method:l[0],start:parseDate(l[1]),maturity:parseDate(l[2]),principal:l[3],rate:l[4]}}

  // ---- rates, live with a fixture behind them
  function curveOf(profile){
    if(!D.curves)return null;
    // the feed carries no heading row: from the eighth column the tenors run 1, 1.5, 2 ... 50 years
    var row=D.curves.filter(function(r){return r[0]==='NEW'&&r[1]===profile})[0];if(!row)return null;
    var out={};for(var i=7;i<row.length;i++){var t=1+0.5*(i-7);var v=parseFloat(row[i]);if(!isNaN(v)&&v>0)out[t]=v}
    return out;
  }
  function rateAt(curve,years){if(!curve)return null;var ks=Object.keys(curve).map(Number).sort(function(a,b){return a-b});var best=ks[0];ks.forEach(function(k){if(Math.abs(k-years)<Math.abs(best-years))best=k});return curve[best]}

  // ---- your figures
  function classify(r){var m=S.matches[r.name];if(!m)return 'other';if(m.indexOf('class:')===0)return m.slice(6);if(m.indexOf('la:')===0)return 'la';var e=D.cp.byId[m];return e?(e.type==='building_society'?'bs':'banks'):'other'}
  function tenorDays(r){
    var t=r.type.toLowerCase();
    if(r.end)return Math.max(0,days(TODAY,r.end));
    var m=t.match(/(\d+)\s*day/);if(m)return +m[1];
    if(/call|mmf|money market|instant|liquidity/.test(t))return 1;
    if(/notice/.test(t))return 35;
    return null;
  }
  function yours(){
    var inv=S.rows.filter(function(r){return r.side==='investment'}),bor=S.rows.filter(function(r){return r.side==='borrowing'});
    var total=inv.reduce(function(a,r){return a+r.amount},0)/1e6;
    var by={};inv.forEach(function(r){var k=classify(r);by[k]=(by[k]||0)+r.amount/1e6});
    var rated=inv.filter(function(r){return r.rate!=null}),rw=rated.reduce(function(a,r){return a+r.amount},0);
    var ret=rw?rated.reduce(function(a,r){return a+r.amount*r.rate},0)/rw:null;
    var dur=inv.map(function(r){return {a:r.amount,d:tenorDays(r),k:classify(r)}}).filter(function(x){return x.d!=null&&x.k!=='funds'});
    var dw=dur.reduce(function(a,x){return a+x.a},0),wd=dw?dur.reduce(function(a,x){return a+x.a*x.d},0)/dw:null;
    var ladder={liquid:0,m1:0,m3:0,m6:0,y1:0,over:0,funds:0};
    inv.forEach(function(r){var k=classify(r),d=tenorDays(r),a=r.amount/1e6;if(k==='funds'){ladder.funds+=a;return}if(d==null||d<=2)ladder.liquid+=a;else if(d<=31)ladder.m1+=a;else if(d<=92)ladder.m3+=a;else if(d<=183)ladder.m6+=a;else if(d<=366)ladder.y1+=a;else ladder.over+=a});
    // one exposure per counterparty: a bank by its master-list entry, whatever it was called in the
    // paste; a fund or an authority by its own name, since two money market funds are two names
    var byName={},matchOf={};inv.forEach(function(r){var m=S.matches[r.name]||'',k=m&&m.indexOf('class:')<0?m:r.name;byName[k]=(byName[k]||0)+r.amount/1e6;matchOf[k]=m});
    var exp=Object.keys(byName).map(function(k){return {id:k,match:matchOf[k],v:byName[k]}}).sort(function(a,b){return b.v-a.v});
    var largest=exp.length&&total?exp[0].v/total*100:null,top3=total?exp.slice(0,3).reduce(function(a,x){return a+x.v},0)/total*100:null;
    var scored=[],unscored=0,bands={};
    exp.forEach(function(x){var e=D.cp.byId[x.id];
      if(!e){var m=x.match||'',k=m.indexOf('class:')===0?m.slice(6):(m.indexOf('la:')===0?'la':null),cs=k&&CLASS_SCORE[k];
        if(cs){var la=k==='la'&&m.indexOf('la:')===0?D.peers.authorities.filter(function(a){return 'la:'+a.code===m})[0]:null;e={short:la?la.name:x.id,kind:cs.label,score:cs.score,band:cs.band,rating_composite:cs.rating,fixed:true}}}
      if(e&&e.score!=null){scored.push({e:e,v:x.v});bands[e.band]=(bands[e.band]||0)+x.v}else unscored+=x.v});
    var sw=scored.reduce(function(a,x){return a+x.v},0),wscore=sw?scored.reduce(function(a,x){return a+x.v*x.e.score},0)/sw:null;
    return {inv:inv,bor:bor,total:total,by:by,ret:ret,days:wd,ladder:ladder,exp:exp,largest:largest,top3:top3,n:exp.length,scored:scored,unscored:unscored,bands:bands,wscore:wscore};
  }
  function borrowing(){
    var feed=(S.auth&&D.loans.loans[S.auth.code])||[];
    var loans=feed.map(loanObj).map(function(l){l.src='PWLB';return l});
    var pasted=S.rows.filter(function(r){return r.side==='borrowing'&&r.start&&r.end}).map(function(r){var d=S.deals[r.name]||{};return {name:r.name,method:d.method||(/ANNUITY/.test(r.profile)?'ANNUITY':/EIP|EQUAL/.test(r.profile)?'EIP':'MATURITY'),io:d.io?monthEnd(d.io):null,freq:d.freq?+d.freq:6,start:r.start,maturity:r.end,principal:r.amount,rate:r.rate||0,src:/pwlb/i.test(r.type)?'PWLB':'Market'}});
    if(loans.length)pasted=pasted.filter(function(l){return l.src!=='PWLB'});
    var all=loans.concat(pasted).map(function(l){l.out=outstanding(l,TODAY);return l}).filter(function(l){return l.out>0});
    var tot=all.reduce(function(a,l){return a+l.out},0);
    var pw=all.filter(function(l){return l.src==='PWLB'}),pwt=pw.reduce(function(a,l){return a+l.out},0);
    var rate=pwt?pw.reduce(function(a,l){return a+l.out*l.rate},0)/pwt:null;
    var life=pwt?pw.reduce(function(a,l){return a+l.out*days(TODAY,l.maturity)/365.25},0)/pwt:null;
    var mix={};pw.forEach(function(l){mix[l.method]=(mix[l.method]||0)+l.out});
    var y0=TODAY.getMonth()>=3?TODAY.getFullYear()+1:TODAY.getFullYear(),proj=[];
    for(var y=y0;y<y0+15;y++){var at=new Date(y,2,31);proj.push({y:y,pwlb:all.filter(function(l){return l.src==='PWLB'}).reduce(function(a,l){return a+outstanding(l,at)},0)/1e6,other:all.filter(function(l){return l.src!=='PWLB'}).reduce(function(a,l){return a+outstanding(l,at)},0)/1e6})}
    var horizon=new Date(TODAY);horizon.setFullYear(horizon.getFullYear()+1);
    var curve=curveOf('MATURITY');
    var refi=all.filter(function(l){return l.maturity<=horizon}).map(function(l){var term=Math.max(1,Math.round(days(l.start,l.maturity)/365.25));return {l:l,term:term,now:rateAt(curve,term)}});
    var refiSum=refi.reduce(function(a,x){return a+x.l.out},0);
    var refiNow=refiSum?refi.reduce(function(a,x){return a+x.l.out*(x.now||0)},0)/refiSum:null,refiWas=refiSum?refi.reduce(function(a,x){return a+x.l.out*x.l.rate},0)/refiSum:null;
    return {loans:all,total:tot/1e6,pwlb:pwt/1e6,n:pw.length,rate:rate,life:life,mix:mix,proj:proj,refi:refi,refiSum:refiSum/1e6,refiNow:refiNow,refiWas:refiWas,ladder:ladderOf(all),fy:fyRows(all,25)};
  }
  // What a loan repays in a period is the fall in what is owed across it, so an EIP or an annuity
  // puts its instalments in the years they fall due and a maturity loan puts everything at the end.
  // Before drawdown the whole principal is still owed, so a loan yet to start is not a negative.
  function owed(l,d){return d<l.start?l.principal:outstanding(l,d)}
  function repaid(loans,a,b){return loans.reduce(function(s,l){return s+Math.max(0,owed(l,a)-owed(l,b))},0)}
  function addYears(d,n){var x=new Date(d);x.setFullYear(x.getFullYear()+n);return x}
  var BUCKETS=[['y1','Under 1 year',0,1],['y2','1 to 2 years',1,2],['y5','2 to 5 years',2,5],['y10','5 to 10 years',5,10],['y20','10 to 20 years',10,20],['y30','20 to 30 years',20,30],['y30p','Over 30 years',30,null]];
  function ladderOf(loans){var out={},tot=loans.reduce(function(s,l){return s+owed(l,TODAY)},0);BUCKETS.forEach(function(b){var v=b[3]==null?loans.reduce(function(s,l){return s+owed(l,addYears(TODAY,b[2]))},0):repaid(loans,addYears(TODAY,b[2]),addYears(TODAY,b[3]));out[b[0]]=tot?v/tot*100:0});return out}
  function peerLadder(){var per={};BUCKETS.forEach(function(b){per[b[0]]=[]});peerSet().forEach(function(a){var ls=(D.loans.loans[a.code]||[]).map(loanObj).filter(function(l){return owed(l,TODAY)>0});if(!ls.length)return;var L=ladderOf(ls);BUCKETS.forEach(function(b){per[b[0]].push(L[b[0]])})});var out={};BUCKETS.forEach(function(b){out[b[0]]=stats(per[b[0]])});return out}
  // financial years, April to March, the current one from today
  function fyRows(loans,n){var y0=TODAY.getMonth()>=3?TODAY.getFullYear():TODAY.getFullYear()-1,out=[];for(var i=0;i<n;i++){var a=i===0?TODAY:new Date(y0+i,3,1),b=new Date(y0+i+1,3,1);
    var tot=0,wr=0;loans.forEach(function(l){var v=Math.max(0,owed(l,a)-owed(l,b));tot+=v;wr+=v*l.rate});
    out.push({fy:String(y0+i).slice(2)+'/'+String(y0+i+1).slice(2),pwlb:repaid(loans.filter(function(l){return l.src==='PWLB'}),a,b)/1e6,other:repaid(loans.filter(function(l){return l.src!=='PWLB'}),a,b)/1e6,rate:tot?wr/tot:null})}return out}
  // ---- what was raised and placed in the last twelve months
  function activity(){
    var cut=new Date(TODAY);cut.setFullYear(cut.getFullYear()-1);
    var inv=S.rows.filter(function(r){return r.side==='investment'&&r.start&&r.start>=cut});
    var ia=inv.reduce(function(a,r){return a+r.amount},0),ir=ia?inv.reduce(function(a,r){return a+r.amount*(r.rate||0)},0)/ia:null;
    var withEnd=inv.filter(function(r){return r.end}),it=withEnd.length?withEnd.reduce(function(a,r){return a+r.amount*days(r.start,r.end)},0)/withEnd.reduce(function(a,r){return a+r.amount},0):null;
    var feed=((S.auth&&D.loans.activity[S.auth.code])||[]).map(function(x){return {when:parseDate(x[0]),mat:parseDate(x[1]),method:x[2],amount:x[3],rate:x[4],src:'PWLB'}}).filter(function(x){return x.when>=cut});
    var pasted=S.rows.filter(function(r){return r.side==='borrowing'&&r.start&&r.start>=cut&&!/pwlb/i.test(r.type)}).map(function(r){return {when:r.start,mat:r.end,method:r.profile||'MATURITY',amount:r.amount,rate:r.rate||0,src:'Market'}});
    var bor=feed.concat(pasted),ba=bor.reduce(function(a,x){return a+x.amount},0),br=ba?bor.reduce(function(a,x){return a+x.amount*x.rate},0)/ba:null;
    var wm=bor.filter(function(x){return x.mat}),bt=wm.length?wm.reduce(function(a,x){return a+x.amount*days(x.when,x.mat)/365.25},0)/wm.reduce(function(a,x){return a+x.amount},0):null;
    // the peers' new PWLB loans in the same window, from the same register
    var ps=peerSet(),raised=[],rates=[],terms=[],borrowers=0;
    ps.forEach(function(a){var ls=(D.loans.activity[a.code]||[]).map(function(x){return {when:parseDate(x[0]),mat:parseDate(x[1]),amount:x[3],rate:x[4]}}).filter(function(x){return x.when>=cut});if(!ls.length)return;borrowers++;var s=ls.reduce(function(q,x){return q+x.amount},0);raised.push(s/1e6);rates.push(ls.reduce(function(q,x){return q+x.amount*x.rate},0)/s);var wm2=ls.filter(function(x){return x.mat});if(wm2.length)terms.push(wm2.reduce(function(q,x){return q+x.amount*days(x.when,x.mat)/365.25},0)/wm2.reduce(function(q,x){return q+x.amount},0))});
    return {inv:inv,ia:ia/1e6,ir:ir,it:it,bor:bor,ba:ba/1e6,br:br,bt:bt,peers:{n:ps.length,borrowers:borrowers,raised:stats(raised),rate:stats(rates),term:stats(terms)},cut:cut};
  }

  // ---- the peers: published where they can be, illustrative where they cannot yet
  function peerSet(){return D.peers.authorities.filter(function(a){return a.class===S.group&&(!S.auth||a.code!==S.auth.code)})}
  function peerAlloc(){
    var ps=peerSet().filter(function(a){return a.inv&&a.inv.total>0}),out={};
    ['banks','bs','mmf','dmadf','gov','la','funds','other'].forEach(function(k){out[k]=stats(ps.map(function(a){return a.inv[k]/a.inv.total*100}))});
    out.total=stats(ps.map(function(a){return a.inv.total}));out.n=ps.length;return out;
  }
  function peerBorrow(){
    var ps=peerSet().filter(function(a){return a.bor&&a.bor.total>0}),out={};
    out.pwlbShare=stats(ps.map(function(a){var lt=a.bor.total-a.bor.short;return lt>0?a.bor.pwlb/lt*100:null}).filter(function(v){return v!=null}));
    var rates=[],lives=[];
    ps.forEach(function(a){var ls=(D.loans.loans[a.code]||[]).map(loanObj).map(function(l){l.out=outstanding(l,TODAY);return l}).filter(function(l){return l.out>0});var t=ls.reduce(function(s,l){return s+l.out},0);if(!t)return;rates.push(ls.reduce(function(s,l){return s+l.out*l.rate},0)/t);lives.push(ls.reduce(function(s,l){return s+l.out*days(TODAY,l.maturity)/365.25},0)/t)});
    out.rate=stats(rates);out.life=stats(lives);out.n=ps.length;return out;
  }
  // until the pool has contributors these are drawn, per authority, from a fixed seed: the
  // same numbers every time, shaped like the real thing, and labelled as invented
  function peerIllustrative(){
    var ps=peerSet(),base={London:[4.2,95,0.18,0.42,24,71],'Unitary Authority':[4.1,120,0.2,0.45,22,70],'Shire County':[4.15,140,0.16,0.4,26,72],'Met District':[4.05,110,0.2,0.46,20,69],'Shire District':[4.0,80,0.24,0.52,16,68],'Combined Authority':[4.2,60,0.22,0.5,14,72]}[S.group]||[4.1,100,0.2,0.45,20,70];
    var ret=[],dur=[],lg=[],t3=[],n=[],sc=[],lad=[];
    ps.forEach(function(a){var h=hash(a.code),g=hash(a.code+'x'),k=hash(a.code+'y');ret.push(base[0]+(h-0.5)*0.5);dur.push(base[1]*(0.55+g*0.9));lg.push((base[2]+(k-0.5)*0.14)*100);t3.push((base[3]+(h-0.5)*0.2)*100);n.push(Math.round(base[4]*(0.6+g*0.8)));sc.push(base[5]+(k-0.5)*8);
      var liq=0.25+h*0.25,m1=0.05+g*0.1,m3=0.15+k*0.15,m6=0.1+h*0.1,y1=Math.max(0,1-liq-m1-m3-m6-0.08),ov=0.03,fu=0.05;lad.push({liquid:liq,m1:m1,m3:m3,m6:m6,y1:y1,over:ov,funds:fu})});
    var L={};['liquid','m1','m3','m6','y1','over','funds'].forEach(function(k){L[k]=stats(lad.map(function(x){return x[k]*100}))});
    return {ret:stats(ret),days:stats(dur),largest:stats(lg),top3:stats(t3),n:stats(n),score:stats(sc),ladder:L};
  }

  // ---- drawing
  function bar(label,you,st,unit,dp){
    var max=Math.max(you||0,st?st.p75:0,1)*1.15;
    var w=function(v){return v==null?0:Math.min(100,v/max*100)};
    return '<div class="l" title="'+esc(label)+'">'+esc(label)+'</div><div class="track"><span class="you" style="width:'+w(you).toFixed(1)+'%"></span>'+
      (st?'<span class="rng" style="left:'+w(st.p25).toFixed(1)+'%;width:'+Math.max(0.5,w(st.p75)-w(st.p25)).toFixed(1)+'%"></span><span class="med" style="left:'+w(st.med).toFixed(1)+'%"></span>':'')+
      '</div><div class="num mono">'+(you==null?'—':you.toFixed(dp==null?0:dp)+(unit||''))+'</div><div class="num mono muted">'+(st?st.med.toFixed(dp==null?0:dp)+(unit||''):'—')+'</div>';
  }
  function bars(rows){return '<div class="bars"><div class="h"></div><div class="h"></div><div class="h num">you</div><div class="h num">median</div>'+rows.join('')+'</div>'}
  function kpi(v,l,sub,cls){return '<div class="kpi"><b>'+v+'</b><span>'+l+'</span>'+(sub?'<i'+(cls?' class="'+cls+'"':'')+'>'+sub+'</i>':'')+'</div>'}
  function vs(you,st,unit,dp,lowGood){if(you==null||!st)return '';var d=you-st.med;var good=lowGood?d<0:d>0;return (d>=0?'+':'−')+Math.abs(d).toFixed(dp)+unit+' vs median'+(Math.abs(d)<1e-9?'':'')}
  function panel(title,tag,sub,body,wide){return '<section class="panel'+(wide?' wide':'')+'"><h3>'+title+'<span class="tag '+(tag==='real'?'tag-real':'tag-ill')+'">'+(tag==='real'?'published':'illustrative')+'</span></h3><p class="sub">'+sub+'</p>'+body+'</section>'}
  function projection(proj){
    var w=1300,h=300,L=70,R=16,T=16,B=30,n=proj.length;
    var max=Math.max.apply(null,proj.map(function(p){return p.pwlb+p.other}))||1;
    var X=function(i){return L+i*(w-L-R)/(n-1)},Y=function(v){return T+(1-v/max)*(h-T-B)};
    var area=function(key,base){var d='M'+X(0)+' '+Y(base(0));proj.forEach(function(p,i){d+='L'+X(i).toFixed(1)+' '+Y(base(i)+p[key]).toFixed(1)});for(var i=n-1;i>=0;i--)d+='L'+X(i).toFixed(1)+' '+Y(base(i)).toFixed(1);return d+'Z'};
    var zero=function(){return 0},pw=function(i){return proj[i].pwlb};
    var out='<svg class="chart" viewBox="0 0 '+w+' '+h+'">';
    [0,0.5,1].forEach(function(f){var v=max*f;out+='<line x1="'+L+'" x2="'+(w-R)+'" y1="'+Y(v).toFixed(1)+'" y2="'+Y(v).toFixed(1)+'" stroke="#eef1f4"/><text class="ax" x="'+(L-6)+'" y="'+(Y(v)+3).toFixed(1)+'" text-anchor="end">'+fmtM(v)+'</text>'});
    out+='<path d="'+area('pwlb',zero)+'" fill="#0a2540" fill-opacity=".85"/><path d="'+area('other',pw)+'" fill="#7d93ad" fill-opacity=".6"/>';
    proj.forEach(function(p,i){if(i%2===0||i===n-1)out+='<text class="ax" x="'+X(i).toFixed(1)+'" y="'+(h-8)+'" text-anchor="middle">'+p.y+'</text>'});
    return out+'</svg><div class="legend"><span><i style="background:#0a2540"></i>PWLB</span><span><i style="background:#7d93ad"></i>other borrowing you pasted</span><span class="muted">outstanding at 31 March, loan by loan</span></div>';
  }
  function fyChart(rows){
    var w=1300,h=300,L=70,R=16,T=16,B=34,n=rows.length;
    var max=Math.max.apply(null,rows.map(function(r){return r.pwlb+r.other}))||1;
    var bw=(w-L-R)/n,Y=function(v){return T+(1-v/max)*(h-T-B)};
    var out='<svg class="chart" viewBox="0 0 '+w+' '+h+'">';
    [0,0.5,1].forEach(function(f){var v=max*f;out+='<line x1="'+L+'" x2="'+(w-R)+'" y1="'+Y(v).toFixed(1)+'" y2="'+Y(v).toFixed(1)+'" stroke="#eef1f4"/><text class="ax" x="'+(L-6)+'" y="'+(Y(v)+4).toFixed(1)+'" text-anchor="end">'+fmtM(v)+'</text>'});
    rows.forEach(function(r,i){var x=L+i*bw+bw*0.15,ww=bw*0.7;
      out+='<rect x="'+x.toFixed(1)+'" y="'+Y(r.pwlb).toFixed(1)+'" width="'+ww.toFixed(1)+'" height="'+(Y(0)-Y(r.pwlb)).toFixed(1)+'" fill="#0a2540"><title>'+r.fy+': PWLB '+fmtM(r.pwlb)+(r.other?', other '+fmtM(r.other):'')+'</title></rect>';
      if(r.other)out+='<rect x="'+x.toFixed(1)+'" y="'+Y(r.pwlb+r.other).toFixed(1)+'" width="'+ww.toFixed(1)+'" height="'+(Y(0)-Y(r.other)).toFixed(1)+'" fill="#7d93ad"><title>'+r.fy+': other '+fmtM(r.other)+'</title></rect>';
      if(i%2===0)out+='<text class="ax" x="'+(x+ww/2).toFixed(1)+'" y="'+(h-10)+'" text-anchor="middle">'+r.fy+'</text>'});
    return out+'</svg><div class="legend"><span><i style="background:#0a2540"></i>PWLB</span><span><i style="background:#7d93ad"></i>other borrowing you pasted</span><span class="muted">principal falling due in each financial year, April to March; instalment loans by the instalments they pay</span></div>';
  }
  function bandMix(bands,total){var keys=['A','B','C','D','E'],out='',x=0;keys.forEach(function(b){var v=bands[b]||0;if(!v)return;var wpc=v/total*100;out+='<span class="band band-'+b+'" style="display:inline-flex;width:'+wpc.toFixed(1)+'%;border-radius:0;height:16px;font-size:10px" title="band '+b+': '+fmtM(v)+'">'+b+'</span>';x+=wpc});return '<div style="display:flex;width:100%;border-radius:5px;overflow:hidden;background:#f1f3f5;margin:6px 0">'+out+'</div>'}

  function render(){
    var Y=yours(),B=borrowing(),PA=peerAlloc(),PB=peerBorrow(),PI=peerIllustrative(),PL=peerLadder(),A=activity(),ps=peerSet();
    $('bench-note').textContent=(S.auth?S.auth.name+' against ':'Against ')+ps.length+' '+S.group+(/s$/.test(S.group)?'':' authorities')+' \u00b7 balances at '+D.peers.quarter+' \u00b7 PWLB book '+D.loans.generated.slice(0,10);
    var labels={banks:'Bank deposits',bs:'Building societies',mmf:'Money market funds',dmadf:'DMADF',gov:'Gilts and T-bills',la:'Other authorities',funds:'Pooled funds',other:'Other'};
    var alloc=bars(Object.keys(labels).map(function(k){return bar(labels[k],Y.total?(Y.by[k]||0)/Y.total*100:0,PA[k],'%',0)}));
    var ladder=bars([['liquid','Liquid: call, MMF, DMADF'],['m1','Under 1 month'],['m3','1 to 3 months'],['m6','3 to 6 months'],['y1','6 to 12 months'],['over','Over 12 months'],['funds','Pooled funds']].map(function(x){return bar(x[1],Y.total?Y.ladder[x[0]]/Y.total*100:0,PI.ladder[x[0]],'%',0)}));
    var credit=Y.scored.map(function(x){return '<tr><td>'+esc(x.e.short)+(x.e.fixed?' <span class="small muted">'+esc(x.e.kind)+', fixed standing</span>':'')+'</td><td class="num mono">'+fmtM(x.v)+'</td><td class="num"><span class="score" style="color:'+(x.e.score>=75?'#1e7a3a':x.e.score>=65?'#7a5d0a':'#b04632')+'">'+x.e.score.toFixed(0)+'</span> <span class="band band-'+esc(x.e.band)+'">'+esc(x.e.band)+'</span></td><td class="mono">'+esc(x.e.rating_composite||'\u2014')+'</td></tr>'}).join('');
    var mixT=Object.keys(B.mix).map(function(m){return m.charAt(0)+m.slice(1).toLowerCase()+' '+fmtM(B.mix[m]/1e6)}).join(' \u00b7 ');
    var curve=curveOf('MATURITY'),pred=D.pred;
    $('panels-inv').innerHTML=
      panel('Investment allocation','real','Share of investments by counterparty class, against the quarterly returns of your peer group ('+PA.n+' filed).',
        '<div class="kpis">'+kpi(fmtM(Y.total),'invested',PA.total?'peer median '+fmtM(PA.total.med):'')+kpi(Y.n,'counterparties')+'</div>'+alloc)+
      panel('Return and duration','ill','Weighted average rate and days to maturity of what you hold; pooled funds excluded from duration.',
        '<div class="kpis">'+kpi(pct(Y.ret,2),'weighted return',vs(Y.ret,PI.ret,'%',2))+kpi(Y.days==null?'\u2014':Math.round(Y.days)+' days','weighted duration',vs(Y.days,PI.days,' days',0))+'</div>'+
        bars([bar('Return',Y.ret,PI.ret,'%',2),bar('Duration, days',Y.days,PI.days,'',0)]))+
      panel('Maturity ladder','ill','Where the money comes back, as a share of investments, by the time left to run.','<div class="kpis">'+kpi(pct(Y.total?Y.ladder.liquid/Y.total*100:null,0),'liquid')+kpi(pct(Y.total?(Y.ladder.liquid+Y.ladder.m1)/Y.total*100:null,0),'within a month')+kpi(pct(Y.total?(Y.ladder.y1+Y.ladder.over)/Y.total*100:null,0),'beyond six months')+'</div>'+ladder)+
      panel('Concentration','ill','How much sits with the largest names.','<div class="kpis">'+kpi(pct(Y.largest,0),'largest exposure',vs(Y.largest,PI.largest,'%',0))+kpi(pct(Y.top3,0),'top three',vs(Y.top3,PI.top3,'%',0))+kpi(Y.n,'counterparties',vs(Y.n,PI.n,'',0))+'</div>'+
        bars([bar('Largest',Y.largest,PI.largest,'%',0),bar('Top three',Y.top3,PI.top3,'%',0)]))+
      panel('Credit risk on the Counterparty scale','ill','Weighted score of what you hold, on the published method. The DMADF, gilts, other authorities and money market funds carry a fixed standing; pooled funds carry market risk and are not scored.',
        '<div class="kpis">'+kpi(Y.wscore==null?'\u2014':Y.wscore.toFixed(1),'weighted score',vs(Y.wscore,PI.score,'',1))+kpi(pct(Y.total?Y.unscored/Y.total*100:null,0),'not scored')+'</div>'+bandMix(Y.bands,Y.total)+
        (credit?'<div class="table-wrap scrollbox" style="max-height:300px"><table class="plain"><thead><tr><th>Name</th><th class="num">Held</th><th class="num">Score</th><th>Agency rating</th></tr></thead><tbody>'+credit+'</tbody></table></div>':'<div class="empty">No name on the master list in this portfolio.</div>'),true);
    $('panels-bor').innerHTML=
      panel('Borrowing','real','Your PWLB book from the published loans'+(S.auth?' for '+esc(S.auth.name):'')+', plus any borrowing you pasted; peers on the same book.',
        '<div class="kpis">'+kpi(fmtM(B.pwlb),'PWLB outstanding',B.n+' loans')+kpi(pct(B.rate,2),'PWLB weighted rate',vs(B.rate,PB.rate,'%',2,true))+kpi(B.life==null?'\u2014':B.life.toFixed(1)+' yrs','weighted life',vs(B.life,PB.life,' yrs',1))+kpi(fmtM(B.total),'all borrowing')+'</div>'+
        bars([bar('PWLB share of long-term',S.auth&&S.auth.bor&&S.auth.bor.total-S.auth.bor.short>0?S.auth.bor.pwlb/(S.auth.bor.total-S.auth.bor.short)*100:null,PB.pwlbShare,'%',0),bar('PWLB rate',B.rate,PB.rate,'%',2),bar('Weighted life, years',B.life,PB.life,'',1)])+
        (mixT?'<p class="note">By repayment method: '+mixT+'</p>':''))+
      panel('Maturity profile','real','Share of what is owed that falls due in each horizon from today, on the same instalment basis; peers on their PWLB books.','<div class="kpis">'+kpi(pct(B.ladder.y1,0),'within a year')+kpi(pct(B.ladder.y1+B.ladder.y2+B.ladder.y5,0),'within five years')+kpi(pct(B.ladder.y30p,0),'beyond thirty')+'</div>'+bars(BUCKETS.map(function(b){return bar(b[1],B.ladder[b[0]],PL[b[0]],'%',0)})))+
      panel('Debt maturing by financial year','real','Principal falling due in each year, loan by loan, over the next twenty-five years.',fyChart(B.fy)+'<div class="table-wrap scrollbox" style="max-height:220px;margin-top:8px"><table class="plain"><thead><tr><th>Year</th><th class="num">PWLB</th><th class="num">Other</th><th class="num">Total</th><th class="num">Rate on it</th></tr></thead><tbody>'+B.fy.map(function(r){return '<tr><td class="mono">'+r.fy+'</td><td class="num mono">'+fmtM(r.pwlb)+'</td><td class="num mono">'+fmtM(r.other)+'</td><td class="num mono b">'+fmtM(r.pwlb+r.other)+'</td><td class="num mono">'+(r.rate==null?'\u2014':r.rate.toFixed(2)+'%')+'</td></tr>'}).join('')+'</tbody></table></div>',true)+
      panel('Outstanding balance, projected','real','Every loan run forward on its own repayment profile'+(Object.keys(S.deals).length?', including the bespoke structures you set':'')+'.',projection(B.proj),true)+
      panel('Refinancing in the next twelve months','real','What matures, what it costs today, and what it cost when taken.',
        '<div class="kpis">'+kpi(fmtM(B.refiSum),'maturing',B.refi.length+' loans')+kpi(pct(B.refiWas,2),'rate on those loans')+kpi(pct(B.refiNow,2),'like-for-like today',B.refiNow!=null&&B.refiWas!=null?((B.refiNow-B.refiWas>=0?'+':'\u2212')+Math.abs(B.refiNow-B.refiWas).toFixed(2)+'% if replaced at today\u2019s PWLB rate'):'',B.refiNow>B.refiWas?'dn':'up')+'</div>'+
        (B.refi.length?'<table class="plain"><thead><tr><th>Matures</th><th>Method</th><th class="num">Outstanding</th><th class="num">Rate</th><th class="num">Today, same term</th></tr></thead><tbody>'+B.refi.sort(function(a,b){return a.l.maturity-b.l.maturity}).slice(0,10).map(function(x){return '<tr><td class="mono">'+iso(x.l.maturity)+'</td><td>'+x.l.src+' '+x.l.method.toLowerCase()+'</td><td class="num mono">'+fmtM(x.l.out/1e6)+'</td><td class="num mono">'+x.l.rate.toFixed(2)+'%</td><td class="num mono">'+(x.now==null?'\u2014':x.now.toFixed(2)+'%')+'</td></tr>'}).join('')+'</tbody></table>':'<div class="empty">Nothing matures in the next twelve months.</div>')+
        (curve?'<p class="note">PWLB maturity today: '+[5,10,25,50].map(function(t){return t+'y '+(rateAt(curve,t)||0).toFixed(2)+'%'}).join(' \u00b7 ')+(pred?' \u00b7 next reset predicted '+pred:'')+'</p>':''),true);
    var P=A.peers;
    $('panels-act').innerHTML=
      panel('New borrowing raised','real','Loans taken in the last twelve months: your PWLB advances from the register plus any borrowing you pasted with a start date in the window. Peers from the same register.',
        '<div class="kpis">'+kpi(fmtM(A.ba),'raised',A.bor.length+' loans')+kpi(pct(A.br,2),'weighted rate',vs(A.br,P.rate,'%',2,true))+kpi(A.bt==null?'\u2014':A.bt.toFixed(1)+' yrs','weighted term',vs(A.bt,P.term,' yrs',1))+kpi(P.borrowers+' of '+P.n,'peers who borrowed')+'</div>'+
        bars([bar('Raised',A.ba,P.raised,'m',1),bar('Rate',A.br,P.rate,'%',2),bar('Term, years',A.bt,P.term,'',1)])+
        (A.bor.length?'<table class="plain"><thead><tr><th>Taken</th><th>Source</th><th>Method</th><th class="num">Amount</th><th class="num">Rate</th><th>Matures</th></tr></thead><tbody>'+A.bor.sort(function(a,b){return b.when-a.when}).slice(0,10).map(function(x){return '<tr><td class="mono">'+iso(x.when)+'</td><td>'+x.src+'</td><td>'+x.method.toLowerCase()+'</td><td class="num mono">'+fmtM(x.amount/1e6)+'</td><td class="num mono">'+x.rate.toFixed(2)+'%</td><td class="mono">'+(x.mat?iso(x.mat):'\u2014')+'</td></tr>'}).join('')+'</tbody></table>':'<div class="empty">No new borrowing in the last twelve months.</div>'))+
      panel('New investments placed','ill','Deposits and funds with a start date in the last twelve months, from your paste. Peer figures are illustrative until the pool has contributors.',
        '<div class="kpis">'+kpi(fmtM(A.ia),'placed',A.inv.length+' deals')+kpi(pct(A.ir,2),'weighted rate',vs(A.ir,PI.ret,'%',2))+kpi(A.it==null?'\u2014':Math.round(A.it)+' days','average term at placement')+'</div>'+
        bars([bar('Rate',A.ir,PI.ret,'%',2),bar('Term, days',A.it,PI.days,'',0)])+
        (A.inv.length?'<table class="plain"><thead><tr><th>Placed</th><th>Counterparty</th><th class="num">Amount</th><th class="num">Rate</th><th>Matures</th></tr></thead><tbody>'+A.inv.slice().sort(function(a,b){return b.start-a.start}).slice(0,12).map(function(r){return '<tr><td class="mono">'+iso(r.start)+'</td><td>'+esc(r.name)+'</td><td class="num mono">'+fmtM(r.amount/1e6)+'</td><td class="num mono">'+(r.rate==null?'\u2014':r.rate.toFixed(2)+'%')+'</td><td class="mono">'+(r.end?iso(r.end):'\u2014')+'</td></tr>'}).join('')+'</tbody></table>':'<div class="empty">No investment in the paste started in the last twelve months.</div>'));
    ['investments','borrowing','activity'].forEach(function(k){document.querySelector('.tab[data-tab="'+k+'"]').disabled=false});
    $('s4').hidden=false;$('st4').classList.add('done');
    poolNote();
  }
  function showTab(k){document.querySelectorAll('.tab').forEach(function(b){b.classList.toggle('active',b.dataset.tab===k)});document.querySelectorAll('.tabpanel').forEach(function(p){p.classList.toggle('active',p.id==='tab-'+k)})}
  function poolNote(){var n=0;try{n=(JSON.parse(localStorage.getItem('pwlb.bench.pool')||'[]')).length}catch(e){}$('pool-note').textContent=n?n+' contribution'+(n>1?'s':'')+' held on this device · the live version posts an anonymised summary to the shared pool':'Adds an anonymised summary of your figures to the peer pool. Prototype: held on this device only.'}

  // ---- steps
  function pickAuth(a){
    S.auth=a;S.group=a.class||S.group;$('group').value=S.group;
    var n=(D.loans.loans[a.code]||[]).length;
    $('auth-pick').hidden=false;$('auth-pick').innerHTML='<b>'+esc(a.name)+'</b><span class="chip chip-muted">'+esc(a.class||'unclassified')+'</span><span>'+n+' PWLB loans on the book</span>'+(a.bor&&a.bor.total?'<span>borrowing '+fmtM(a.bor.total)+' at '+D.peers.quarter_borrowing+'</span>':'')+(a.inv&&a.inv.total?'<span>investments '+fmtM(a.inv.total)+'</span>':'');
    $('auth-q').value=a.name;$('auth-sugg').hidden=true;$('st1').classList.add('done');
    if(S.confirmed)render();
  }
  function suggestAuth(){
    var t=$('auth-q').value.trim().toLowerCase(),box=$('auth-sugg');if(!t){box.hidden=true;return}
    var hits=D.peers.authorities.filter(function(a){return a.name.toLowerCase().indexOf(t)>=0&&a.class!=='Park'&&a.class!=='Waste'}).slice(0,10);
    box.innerHTML=hits.map(function(a){return '<button data-code="'+a.code+'"><span>'+esc(a.name)+'</span><span class="muted small">'+esc(a.class||'')+'</span></button>'}).join('')||'<button disabled>No authority matches</button>';box.hidden=false;
  }
  function readPaste(){
    var p=parsePaste($('paste').value);
    if(!p.rows.length){$('read-note').textContent='Nothing readable yet: each row needs at least a name and an amount.';return}
    S.rows=p.rows;S.confirmed=false;
    var names=[];p.rows.forEach(function(r){if(names.indexOf(r.name)<0)names.push(r.name)});S.names=names;
    var mem=memory();S.matches={};S.deals=dealsMemory();
    names.forEach(function(nm){var c=candidates(nm),side=(p.rows.filter(function(r){return r.name===nm})[0]||{}).side;S.matches[nm]=mem[nm]||(c.length&&c[0].score>=0.6?c[0].id:(side==='borrowing'?'class:lender':'class:other'))});
    var got=Object.keys(p.cols).filter(function(k){return p.cols[k]!=null});
    $('read-note').textContent=p.rows.length+' rows read · columns found: '+got.join(', ')+(p.hasHead?' (from the headings and the contents)':' (from the contents; no heading row)');
    $('st2').classList.add('done');
    renderMatch();
  }
  function renderMatch(){
    var unsure=0,rows=S.names.map(function(nm){
      var c=candidates(nm),cur=S.matches[nm],sure=(c.length&&c[0].score>=0.8&&cur===c[0].id)||memory()[nm]===cur;if(!sure)unsure++;
      var opts=c.map(function(o){return '<option value="'+esc(o.id)+'"'+(o.id===cur?' selected':'')+'>'+esc(o.label)+'</option>'}).join('')+
        Object.keys(CLASS_LABEL).map(function(k){var id='class:'+k;return c.some(function(o){return o.id===id})?'':'<option value="'+id+'"'+(id===cur?' selected':'')+'>'+CLASS_LABEL[k]+'</option>'}).join('');
      var amt=S.rows.filter(function(r){return r.name===nm}).reduce(function(a,r){return a+r.amount},0)/1e6;
      var side=(S.rows.filter(function(r){return r.name===nm})[0]||{}).side,d=S.deals[nm];
      var tailor=side==='borrowing'?' <button class="filter tailor" data-deal="'+esc(nm)+'" type="button">Tailor</button>'+(d?'<span class="deal-tag">'+esc(d.method.toLowerCase())+(d.io?', interest only to '+esc(monthLabel(d.io)):'')+(d.freq&&d.freq!=='6'?', '+{'12':'annual','3':'quarterly'}[d.freq]:'')+'</span>':''):'';
      return '<tr'+(sure?'':' class="bad"')+'><td><b>'+esc(nm)+'</b>'+tailor+'</td><td class="num mono">'+fmtM(amt)+'</td><td class="match-cell"><select data-name="'+esc(nm)+'">'+opts+'</select></td><td>'+(sure?'<span class="chip chip-good">matched</span>':'<span class="chip chip-warn">check</span>')+'</td></tr>';
    }).join('');
    $('match-table').innerHTML='<thead><tr><th>As pasted</th><th class="num">Amount</th><th>Read as</th><th></th></tr></thead><tbody>'+rows+'</tbody>';
    $('match-lede').textContent=S.names.length+' names in '+S.rows.length+' rows. '+(unsure?unsure+' need'+(unsure===1?'s':'')+' a look; the rest matched the master list or a class outright.':'Every name matched.');
    $('s3').hidden=false;$('s3').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function confirm(){
    var mem=memory();S.names.forEach(function(nm){mem[nm]=S.matches[nm]});remember(mem);
    try{localStorage.setItem('pwlb.bench.deals',JSON.stringify(S.deals))}catch(e){}
    S.confirmed=true;$('st3').classList.add('done');
    if(!S.group){S.group=$('group').value}
    render();showTab('investments');$('s4').scrollIntoView({behavior:'smooth',block:'start'});
  }

  function init(){
    var groups={};D.peers.authorities.forEach(function(a){if(a.class&&a.class!=='Park'&&a.class!=='Waste')groups[a.class]=(groups[a.class]||0)+1});
    $('group').innerHTML=Object.keys(groups).sort().map(function(g){return '<option value="'+esc(g)+'">'+esc(g)+' ('+groups[g]+')</option>'}).join('');
    S.group='London';$('group').value=S.group;
    $('auth-note').textContent=D.peers.authorities.length+' authorities · returns to '+D.peers.quarter;
    $('auth-q').addEventListener('input',suggestAuth);
    $('auth-sugg').addEventListener('click',function(e){var b=e.target.closest('button[data-code]');if(!b)return;pickAuth(D.peers.authorities.filter(function(a){return a.code===b.dataset.code})[0])});
    document.addEventListener('click',function(e){if(!e.target.closest('.sugg'))$('auth-sugg').hidden=true});
    $('group').addEventListener('change',function(){S.group=$('group').value;if(S.confirmed)render()});
    $('read').addEventListener('click',readPaste);
    $('demo').addEventListener('click',function(){fetch('data/demo.tsv').then(function(r){return r.text()}).then(function(t){$('paste').value=t;if(!S.auth){var a=D.peers.authorities.filter(function(x){return x.name==='Camden'})[0];if(a)pickAuth(a)}readPaste();
      if(!S.deals['Phoenix Life']){S.deals['Phoenix Life']={method:'ANNUITY',io:'2031-09',freq:'6'};renderMatch()}})});
    $('match-table').addEventListener('change',function(e){var s=e.target.closest('select[data-name]');if(s)S.matches[s.dataset.name]=s.value});
    $('confirm').addEventListener('click',confirm);
    $('tabs').addEventListener('click',function(e){var b=e.target.closest('.tab');if(b&&!b.disabled)showTab(b.dataset.tab)});
    $('match-table').addEventListener('click',function(e){var b=e.target.closest('[data-deal]');if(!b)return;var nm=b.dataset.deal,d=S.deals[nm]||{};$('deal-name').textContent=nm;$('deal-method').value=d.method||'MATURITY';$('deal-io').value=d.io||'';$('deal-freq').value=d.freq||'6';$('deal-dlg').dataset.name=nm;$('deal-dlg').showModal()});
    $('deal-save').addEventListener('click',function(){var nm=$('deal-dlg').dataset.name;S.deals[nm]={method:$('deal-method').value,io:$('deal-io').value||'',freq:$('deal-freq').value};try{localStorage.setItem('pwlb.bench.deals',JSON.stringify(S.deals))}catch(e){}$('deal-dlg').close();renderMatch();if(S.confirmed)render()});
    $('deal-close').addEventListener('click',function(){$('deal-dlg').close()});
    $('pool').addEventListener('click',function(){var pool=[];try{pool=JSON.parse(localStorage.getItem('pwlb.bench.pool')||'[]')}catch(e){}var Y=yours();pool.push({at:iso(TODAY),group:S.group,total:Y.total,ret:Y.ret,days:Y.days,largest:Y.largest,score:Y.wscore});try{localStorage.setItem('pwlb.bench.pool',JSON.stringify(pool))}catch(e){}poolNote()});
    $('src-note').textContent='Peer set: '+D.peers.authorities.length+' authorities, balances to '+D.peers.quarter+'. Master list: '+D.cp.rows.length+' names.';
  }

  var rates=Promise.all([
    json(RATES_URL+'dashboard-curves-latest').catch(function(){return json('data/feeds/dashboard-curves-latest.json')}),
    json(RATES_URL+'pwlb-pred-maturity').catch(function(){return json('data/feeds/pwlb-pred-maturity.json')})
  ]).then(function(r){D.curves=r[0].data.values;var pv=r[1].data.values;var row=pv.filter(function(x){return /predict|next/i.test(x[0])})[0]||pv[1];if(row)D.pred=pv[0].slice(1).map(function(t,i){return row[i+1]?t+'y '+row[i+1]:''}).filter(Boolean).filter(function(x,i){return [1,3,6,8].indexOf(i)>=0}).join(' · ')}).catch(function(){});
  Promise.all([json('data/peers.json'),json('data/pwlb-loans.json'),json(CP_URL).catch(function(){return json('data/feeds/counterparty-policy.json')}),rates])
    .then(function(r){D.peers=r[0];D.loans=r[1];D.cp=r[2];D.cp.byId={};D.cp.rows.forEach(function(x){D.cp.byId[x.id]=x});init()})
    .catch(function(e){$('auth-note').textContent='The data could not be loaded: '+e.message});
})();
