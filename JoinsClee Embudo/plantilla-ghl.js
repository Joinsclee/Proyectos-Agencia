<!-- ===================================================================
     SALA DE MÁQUINAS · JoinsClee — bloque Custom HTML para GoHighLevel
     Pegar ENTERO en un bloque Custom HTML / Code de GHL.

     Por qué está construido así (cuatro trampas de GHL, todas silenciosas):
     1. Ninguna ruta relativa funciona: CSS y JS van embebidos, y la fuente
        se pide a Google con URL absoluta desde document.head.
     2. El CSS de un documento completo arrasa la cabecera y el pie de GHL:
        aquí todo vive dentro de un Shadow DOM, así que no se escapa ni una
        regla, y el CSS de GHL tampoco deforma la pieza.
     3. Un ancestro con transform rompe position:sticky/fixed: se detecta al
        arrancar y la barra degrada a estática en vez de romperse.
     4. Sin imágenes: nada que subir al CDN.

     No editar a mano: se regenera desde vitrina.html.
     ==================================================================== -->
<div id="jc-sala-maquinas"></div>
<script>
(function(){
  "use strict";
  var host = document.getElementById("jc-sala-maquinas");
  if(!host || host.shadowRoot) return;

  // 1 · la fuente va al head del documento: las @font-face no cruzan el shadow
  if(!document.getElementById("jc-sala-fonts")){
    var f = document.createElement("link");
    f.id = "jc-sala-fonts"; f.rel = "stylesheet";
    f.href = "https://fonts.googleapis.com/css2?family=Teko:wght@400;500;600&family=Rubik:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap";
    document.head.appendChild(f);
  }

  var R = host.attachShadow({mode:"open"});
  R.innerHTML = [
    "<style>", __CSS__, "</style>",
    __MARKUP__
  ].join("");

  var $  = function(sel){ return R.querySelector(sel); };
  var $$ = function(sel){ return Array.prototype.slice.call(R.querySelectorAll(sel)); };

__DATOS__
  
  var board  = $("#board");
  var input  = $("#q");
  var status = $("#status");
  var active = new Set();
  var flat = [], cursor = -1, statusTimer = null;

  var esc  = function(s){ return String(s).replace(/[&<>"']/g, function(c){
    return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]; }); };
  var norm = function(s){ return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase(); };

  function visible(it){
    var q = input.value.trim();
    if(q){
      var hay = norm(it.name+" "+it.who+" "+(it.desc||"")+" "+(it.url||"")+" "+(it.path||""));
      if(!norm(q).split(/\s+/).every(function(w){ return hay.indexOf(w) > -1; })) return false;
    }
    var ok = true;
    active.forEach(function(f){
      if(f === "demo" && !it.demo) ok = false;
      if(f.indexOf("layer:") === 0 && it.layers.indexOf(f.slice(6)) === -1) ok = false;
      if(f.indexOf("access:") === 0 && it.access !== f.slice(7)) ok = false;
    });
    return ok;
  }

  function itemHTML(it, layerId, idx){
    var a = ACCESS[it.access], cls = a[0], label = a[1];
    var target = it.url || it.path;
    var facts = (it.facts||[]).map(function(f){
      return '<div class="fact"><b>'+esc(f[0])+'</b><span>'+esc(f[1])+'</span></div>'; }).join("");
    var open = it.url
      ? '<a class="go" href="'+esc(it.url)+'" target="_blank" rel="noopener noreferrer" aria-label="Abrir '+esc(it.name)+', '+esc(it.who)+', en una pestaña nueva">Abrir &#8599;</a>'
      : "";
    return '<div class="item'+(it.demo?" is-demo":"")+'" id="row-'+layerId+'-'+idx+'">'
      + '<div class="name"><b>'+esc(it.name)+'</b><i>'+esc(it.who)+'</i></div>'
      + '<p class="desc">'+esc(it.desc||"")+'</p>'
      + '<div class="facts">'+facts+'</div>'
      + '<div class="acts"><span class="tag '+cls+'">'+label+'</span>'+open
      + '<button class="cp" type="button" data-copy="'+esc(target)+'" aria-label="Copiar '
      + (it.url?"el enlace":"la ruta")+' de '+esc(it.name)+'">'+(it.url?"Copiar":"Ruta")+'</button>'
      + '</div></div>';
  }

  function render(announce){
    var shown = ITEMS.filter(visible);
    flat = []; cursor = -1;
    var html = "";
    LAYERS.forEach(function(L){
      var list = shown.filter(function(i){ return i.layers.indexOf(L.id) > -1; });
      if(!list.length) return;
      list.forEach(function(it,k){ flat.push({it:it, rowId:"row-"+L.id+"-"+k}); });
      html += '<section class="layer"><div class="layer-head"><h2>'+L.name+'</h2>'
            + '<p class="sub">'+L.sub+'</p></div><div class="rows">'
            + list.map(function(it,k){ return itemHTML(it, L.id, k); }).join("")
            + '</div></section>';
    });
    board.innerHTML = html || '<div class="none"><b>Nada coincide con esa búsqueda</b>Prueba con el nombre de un cliente, un canal o un sistema.</div>';
    $("#n-shown").textContent = shown.length;
    if(announce) say(shown.length + (shown.length === 1 ? " resultado" : " resultados"));
  }

  function say(msg){
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function(){ status.textContent = msg; }, 180);
  }

  function select(i){
    var prev = $(".item.sel");
    if(prev) prev.classList.remove("sel");
    if(i < 0 || i >= flat.length){ cursor = -1; return; }
    cursor = i;
    var el = $("#" + flat[i].rowId);
    if(!el) return;
    el.classList.add("sel");
    el.scrollIntoView({block:"nearest"});
    var it = flat[i].it;
    say(it.name + ". " + (it.url ? "Enter para abrir." : "Sin enlace público."));
  }

  function counts(){
    $("#n-total").textContent = ITEMS.length;
    $("#n-prod").textContent = ITEMS.filter(function(i){
      return i.layers.indexOf("producto") > -1 && i.access !== "interno" && i.publico !== false; }).length;
    $$("[data-k]").forEach(function(el){
      var f = el.getAttribute("data-k");
      el.textContent = ITEMS.filter(function(i){
        if(f === "demo") return i.demo;
        if(f.indexOf("layer:") === 0) return i.layers.indexOf(f.slice(6)) > -1;
        return i.access === f.slice(7);
      }).length;
    });
  }

  $$(".chip[data-filter]").forEach(function(btn){
    btn.addEventListener("click", function(){
      var f = btn.getAttribute("data-filter");
      var on = btn.getAttribute("aria-pressed") === "true";
      if(!on && f.indexOf(":") > -1){
        var fam = f.split(":")[0] + ":";
        $$('.chip[data-filter^="'+fam+'"]').forEach(function(o){
          o.setAttribute("aria-pressed","false");
          active.delete(o.getAttribute("data-filter"));
        });
      }
      btn.setAttribute("aria-pressed", String(!on));
      if(on) active.delete(f); else active.add(f);
      render(true);
    });
  });

  $("#reset").addEventListener("click", function(){
    active.clear(); input.value = "";
    $$(".chip[data-filter]").forEach(function(b){ b.setAttribute("aria-pressed","false"); });
    render(true); input.focus();
  });

  input.addEventListener("input", function(){ render(true); });

  board.addEventListener("click", function(e){
    var btn = e.target.closest("[data-copy]");
    if(!btn) return;
    var text = btn.getAttribute("data-copy");
    var label = btn.getAttribute("data-label");
    if(!label){ label = btn.textContent; btn.setAttribute("data-label", label); }

    function done(ok){
      clearTimeout(btn._t);
      btn.textContent = ok ? "Copiado \u2713" : "Falló";
      say(ok ? ("Copiado: " + text) : "No se pudo copiar. Selecciona el enlace a mano.");
      btn._t = setTimeout(function(){ btn.textContent = label; }, 1400);
    }
    function fallback(){
      var ok = false;
      try{
        var ta = document.createElement("textarea");
        ta.value = text; ta.setAttribute("readonly","");
        ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
        document.body.appendChild(ta); ta.select();
        ok = document.execCommand("copy");
        ta.remove(); btn.focus();
      }catch(err){ ok = false; }
      done(ok);
    }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){ done(true); }, fallback);
    } else { fallback(); }
  });

  function editable(el){
    return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  }
  // el foco real puede estar dentro del shadow
  function focused(){ return R.activeElement || document.activeElement; }
  // solo respondemos si el usuario está operando la pieza, no el resto de la página
  function mine(){
    var a = document.activeElement;
    return a === host || a === document.body || a === document.documentElement;
  }

  document.addEventListener("keydown", function(e){
    if(e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.defaultPrevented) return;
    var f = focused();

    if(e.key === "/" && !editable(f) && mine()){
      e.preventDefault(); input.focus(); input.select(); return;
    }
    if(e.key === "Escape" && f === input){
      if(input.value){ input.value = ""; render(true); } else { input.blur(); }
      return;
    }
    if((e.key === "ArrowDown" || e.key === "ArrowUp") && flat.length){
      if(f !== input && !mine()) return;
      if(editable(f) && f !== input) return;
      e.preventDefault();
      select(e.key === "ArrowDown"
        ? (cursor + 1) % flat.length
        : (cursor <= 0 ? flat.length - 1 : cursor - 1));
      return;
    }
    if(e.key === "Enter" && cursor >= 0 && (f === input || mine())){
      var it = flat[cursor].it;
      if(it.url){ e.preventDefault(); window.open(it.url, "_blank", "noopener"); }
    }
  });

  // 3 · GHL envuelve el bloque en secciones propias; un ancestro con transform,
  //     filter, perspective, will-change o contain rompe sticky. Degradar, no romper.
  var ROMPEN = /(transform|filter|perspective|backdrop-filter)/;
  function ancestroQueEstorba(el){
    for(var n = el.parentElement; n && n !== document.documentElement; n = n.parentElement){
      var cs = getComputedStyle(n);
      if(cs.transform !== "none" || cs.perspective !== "none") return true;
      if(cs.filter !== "none" || cs.backdropFilter && cs.backdropFilter !== "none") return true;
      if(ROMPEN.test(cs.willChange || "")) return true;
      if(/paint|layout|strict|content/.test(cs.contain || "")) return true;
    }
    return false;
  }
  var bar = $(".command");
  function ajustarBarra(){
    if(ancestroQueEstorba(host)) bar.classList.add("no-sticky");
    else bar.classList.remove("no-sticky");
    host.style.setProperty("--bar", (bar.offsetHeight + 16) + "px");
    R.host.style.display = "block";
  }
  if(window.ResizeObserver){ new ResizeObserver(ajustarBarra).observe(bar); }
  else { window.addEventListener("resize", ajustarBarra); }
  // GHL puede volver a envolver el bloque después de cargar
  window.addEventListener("load", ajustarBarra);
  setTimeout(ajustarBarra, 800);

  counts();
  render(false);
  ajustarBarra();
})();
</script>
