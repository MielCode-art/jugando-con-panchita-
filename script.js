//==============================
// JUGANDO CON PANCHITA
//==============================

// VARIABLES GLOBALES
let puntos = 0;
let vidas = 3;
let nivel = 1;
let preguntaActual = 0;
let tipoJuego = "";
let preguntas = [];

let tiempoRestante = 15;
let temporizador = null;
let respuestaBloqueada = false;
let audioContexto = null;
let musicaActiva = false;
let sonidoActivado = true;
let intervaloMusica = null;
let notaMusica = 0;
let musicaModo = "";
let actividadCompletada = false;
let permitirSonidosJuego = false;
const osciladoresActivos = new Set();

// Progreso independiente para cada actividad.
const CLAVE_PROGRESO = "panchita_progreso_v1";
function leerProgresos() {
    try { return JSON.parse(localStorage.getItem(CLAVE_PROGRESO) || "{}"); }
    catch (error) { return {}; }
}
function guardarProgreso(completado = false) {
    if (!tipoJuego || !preguntas.length) return;
    const datos = leerProgresos();
    const anterior = datos[tipoJuego] || {};
    datos[tipoJuego] = {
        nivel, puntos, vidas, preguntaActual,
        preguntas: JSON.parse(JSON.stringify(preguntas)),
        tiempoRestante,
        nivelMaximo: Math.max(anterior.nivelMaximo || 1, nivel),
        completado
    };
    try {
        localStorage.setItem(CLAVE_PROGRESO, JSON.stringify(datos));
    } catch (error) {
        console.warn("No se pudo guardar el progreso en este navegador.", error);
    }
}
function borrarProgreso(tipo) {
    const datos = leerProgresos();
    delete datos[tipo];
    try { localStorage.setItem(CLAVE_PROGRESO, JSON.stringify(datos)); } catch (error) {}
}
function iniciarAudio() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx || !sonidoActivado) return;
    if (!audioContexto) audioContexto = new AudioCtx();
    if (audioContexto.state === "suspended") audioContexto.resume();
    // La música se inicia únicamente desde abrirJuego() o volverMenuJuegos().
    // Así, un efecto de sonido atrasado no vuelve a encender la música del juego.
}
function tono(frecuencia, duracion=0.16, volumen=0.75, forma="sine") {
    if (!sonidoActivado || !permitirSonidosJuego) return;
    iniciarAudio();
    if (!audioContexto) return;
    const oscilador = audioContexto.createOscillator();
    const ganancia = audioContexto.createGain();
    oscilador.type = forma;
    oscilador.frequency.value = frecuencia;
    ganancia.gain.setValueAtTime(0.0001, audioContexto.currentTime);
    ganancia.gain.exponentialRampToValueAtTime(Math.max(0.001, volumen), audioContexto.currentTime + 0.015);
    ganancia.gain.exponentialRampToValueAtTime(0.0001, audioContexto.currentTime + duracion);
    oscilador.connect(ganancia); ganancia.connect(audioContexto.destination);
    osciladoresActivos.add(oscilador);
    oscilador.onended = () => osciladoresActivos.delete(oscilador);
    oscilador.start(); oscilador.stop(audioContexto.currentTime + duracion + 0.03);
}
function sonidoCorrecto() { tono(660, .18, .85); setTimeout(() => tono(880, .22, .85), 130); }
function sonidoIncorrecto() { tono(220, .28, .8, "triangle"); }
function sonidoBoton() { tono(520, .09, .65); }
function iniciarMusica(modo = "juego") {
    if (!sonidoActivado || !audioContexto) return;
    if (musicaActiva && musicaModo === modo) return;

    detenerMusica();
    musicaModo = modo;
    musicaActiva = true;
    notaMusica = 0;

    // Melodía tranquila para el menú y melodía alegre durante los juegos.
    const melodias = {
        juego: [523, 659, 784, 659, 587, 698, 784, 698],
        menu: [392, 494, 587, 494, 440, 523, 587, 523]
    };
    const melodia = melodias[modo] || melodias.juego;

    intervaloMusica = setInterval(() => {
        if (!sonidoActivado || !audioContexto || !musicaActiva) return;
        tono(melodia[notaMusica % melodia.length], .30, modo === "menu" ? .12 : .16);
        notaMusica++;
    }, modo === "menu" ? 560 : 430);
}
function detenerMusica() {
    musicaActiva = false;
    if (intervaloMusica !== null) {
        clearInterval(intervaloMusica);
        intervaloMusica = null;
    }
    musicaModo = "";
}
function alternarSonido() {
    sonidoActivado = !sonidoActivado;
    const boton = document.getElementById("botonSonidoPanchita");
    if (boton) boton.textContent = sonidoActivado ? "🔊 Sonido activado" : "🔇 Sonido apagado";
    if (sonidoActivado) {
        if (audioContexto && audioContexto.state === "suspended") audioContexto.resume();
        if (permitirSonidosJuego) iniciarMusica("juego");
    } else {
        detenerMusica();
    }
}
function prepararControlesJuego() {
    if (document.getElementById("controlesPanchita")) return;
    const zona = document.createElement("div");
    zona.id = "controlesPanchita";
    zona.style.cssText = "display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:18px auto;max-width:850px;";
    zona.innerHTML = `
      <button class="btn-volver" type="button" onclick="alternarSonido()" id="botonSonidoPanchita">🔊 Sonido activado</button>
      ${botonesOtrasActividades()}
      <button class="btn-volver" type="button" onclick="volverMenuJuegos()">🎮 Menú principal</button>`;
    const pantalla = document.getElementById("pantallaJuego");
    pantalla.appendChild(zona);
}
function volverMenuJuegos() {
    // Guardar antes de ocultar la partida para poder retomarla después.
    // Si ya terminó los cinco niveles, conservar el registro de completado.
    if (!actividadCompletada) guardarProgreso();
    detenerTemporizador();
    const pantalla = document.getElementById("pantallaJuego");
    if (pantalla) pantalla.style.display = "none";

    // La música del juego se corta y se cambia por la melodía del menú.
    permitirSonidosJuego = false;
    detenerMusica();
    // Cortar inmediatamente cualquier nota o efecto que siga sonando.
    for (const oscilador of osciladoresActivos) {
        try { oscilador.stop(); } catch (error) {}
    }
    osciladoresActivos.clear();

    // Suspender por completo el AudioContext: así no queda ninguna nota
    // reproduciéndose en segundo plano al regresar al menú principal.
    if (audioContexto && audioContexto.state === "running") {
        audioContexto.suspend().catch(() => {});
    }

    actualizarProgresoGeneral(true);
    const menu = document.getElementById("juegos");
    if (menu) menu.scrollIntoView({ behavior: "smooth", block: "start" });
}
function cambiarActividad(tipo) {
    sonidoBoton();
    if (!actividadCompletada) guardarProgreso();
    document.getElementById("gameOverPanchita")?.remove();
    abrirJuego(tipo);
}
function botonesOtrasActividades() {
    const nombres = { sinonimos: ["antonimos", "oraciones"], antonimos: ["sinonimos", "oraciones"], oraciones: ["sinonimos", "antonimos"] };
    const etiquetas = { sinonimos: "📚 Sinónimos", antonimos: "🔄 Antónimos", oraciones: "✍️ Oraciones simples" };
    return (nombres[tipoJuego] || []).map(tipo => `<button type="button" class="btn-volver" onclick="cambiarActividad('${tipo}')">${etiquetas[tipo]}</button>`).join("");
}

// ==============================
// 📚 PREGUNTAS DE SINÓNIMOS
// ==============================
let preguntasNivel1 = [
 { pregunta: "¿Cuál es el sinónimo de FELIZ?", opciones: ["Alegre", "Triste", "Enojado", "Cansado"], correcta: 0 },
 { pregunta: "¿Cuál es el sinónimo de GRANDE?", opciones: ["Pequeño", "Enorme", "Delgado", "Bajo"], correcta: 1 },
 { pregunta: "¿Cuál es el sinónimo de RÁPIDO?", opciones: ["Lento", "Veloz", "Pesado", "Débil"], correcta: 1 },
 { pregunta: "¿Cuál es el sinónimo de INTELIGENTE?", opciones: ["Sabio", "Torpe", "Lento", "Débil"], correcta: 0 },
 { pregunta: "¿Cuál es el sinónimo de ENOJADO?", opciones: ["Furioso", "Feliz", "Dormido", "Calmado"], correcta: 0 },
 { pregunta: "¿Cuál es el sinónimo de COMENZAR?", opciones: ["Terminar", "Empezar", "Dormir", "Parar"], correcta: 1 },
 { pregunta: "¿Cuál es el sinónimo de PEQUEÑO?", opciones: ["Enorme", "Gigante", "Chico", "Largo"], correcta: 2 },
 { pregunta: "¿Cuál es el sinónimo de HABLAR?", opciones: ["Conversar", "Correr", "Dormir", "Saltar"], correcta: 0 },
 { pregunta: "¿Cuál es el sinónimo de BAILE?", opciones:["Balet","Canto","Danza","Danzarte"], correcta:2 },
 { pregunta: "¿Cuál es el sinónimo de BONITO?", opciones:["Hermoso","Feo","Oscuro","Viejo"], correcta:0 }
];

let preguntasNivel2 = [
 { pregunta: "¿Cuál es el sinónimo de VALIENTE?", opciones: ["Miedoso", "Cobarde", "Atrevido", "Débil"], correcta: 2 },
 { pregunta: "¿Cuál es el sinónimo de RÁPIDAMENTE?", opciones: ["Despacio", "Deprisa", "Quieto", "Lento"], correcta: 1 },
 { pregunta: "¿Cuál es el sinónimo de COMENZAR?", opciones: ["Iniciar", "Terminar", "Parar", "Cerrar"], correcta: 0 },
 { pregunta: "¿Cuál es el sinónimo de FELICIDAD?", opciones: ["Tristeza", "Alegría", "Enojo", "Miedo"], correcta: 1 },
 { pregunta: "¿Cuál es el sinónimo de ENORME?", opciones: ["Pequeño", "Gigante", "Corto", "Delgado"], correcta: 1 },
 { pregunta: "¿Cuál es el sinónimo de SILENCIOSO?", opciones: ["Ruidoso", "Callado", "Gritón", "Fuerte"], correcta: 1 },
 { pregunta: "¿Cuál es el sinónimo de TERMINAR?", opciones: ["Acabar", "Comenzar", "Abrir", "Empezar"], correcta: 0 },
 { pregunta: "¿Cuál es el sinónimo de INTELIGENTE?", opciones: ["Listo", "Torpe", "Lento", "Dormido"], correcta: 0 }
];

let preguntasNivel3 = [
 { pregunta: "¿Cuál es el sinónimo de ABUNDANTE?", opciones: ["Vacío", "Pequeño", "Numeroso", "Escaso"], correcta: 2 },
 { pregunta: "¿Cuál es el sinónimo de ADMIRAR?", opciones: ["Contemplar", "Rechazar", "Ignorar", "Despreciar"], correcta: 0 },
 { pregunta: "¿Cuál es el sinónimo de PRECISO?", opciones: ["Confuso", "Exacto", "Dudoso", "Incorrecto"], correcta: 1 },
 { pregunta: "¿Cuál es el sinónimo de VELOZ?", opciones: ["Pesado", "Débil", "Lento", "Rápido"], correcta: 3 },
 { pregunta: "¿Cuál es el sinónimo de GENEROSO?", opciones: ["Cruel", "Bondadoso", "Tacaño", "Egoísta"], correcta: 1 },
 { pregunta: "¿Cuál es el sinónimo de DIFICULTAD?", opciones: ["Solución", "Ayuda", "Facilidad", "Problema"], correcta: 3 },
 { pregunta: "¿Cuál es el sinónimo de SERENO?", opciones: ["Furioso", "Nervioso", "Tranquilo", "Inquieto"], correcta: 2 },
 { pregunta: "¿Cuál es el sinónimo de INICIAR?", opciones: ["Perder", "Cerrar", "Comenzar", "Terminar"], correcta: 2 },
 { pregunta: "¿Cuál es el sinónimo de ESCUCHAR?", opciones: ["Gritar", "Oír", "Correr", "Hablar"], correcta: 1 },
 { pregunta: "¿Cuál es el sinónimo de DESCONOCIDO?", opciones: ["Ignorado", "Famoso", "Popular", "Conocido"], correcta: 0 }
];

let preguntasNivel4 = [
 { pregunta: "¿Cuál es el sinónimo de EFÍMERO?", opciones: ["Duradero", "Eterno", "Pasajero", "Infinito"], correcta: 2 },
 { pregunta: "¿Cuál es el sinónimo de PERSPICAZ?", opciones: ["Despistado", "Astuto", "Ingenuo", "Lento"], correcta: 1 },
 { pregunta: "¿Cuál es el sinónimo de CAUTELOSO?", opciones: ["Imprudente", "Descuidado", "Impulsivo", "Prudente"], correcta: 3 },
 { pregunta: "¿Cuál es el sinónimo de BENÉVOLO?", opciones: ["Bondadoso", "Hostil", "Cruel", "Malvado"], correcta: 0 },
 { pregunta: "¿Cuál es el sinónimo de INUSUAL?", opciones: ["Habitual", "Extraño", "Normal", "Común"], correcta: 1 },
 { pregunta: "¿Cuál es el sinónimo de TENAZ?", opciones: ["Perezoso", "Inconstante", "Perseverante", "Débil"], correcta: 2 },
 { pregunta: "¿Cuál es el sinónimo de PRÓSPERO?", opciones: ["Desafortunado", "Pobre", "Fracaso", "Exitoso"], correcta: 3 },
 { pregunta: "¿Cuál es el sinónimo de HOSTIL?", opciones: ["Agresivo", "Amable", "Cariñoso", "Amistoso"], correcta: 0 },
 { pregunta: "¿Cuál es el sinónimo de SOBRIO?", opciones: ["Excesivo", "Moderado", "Exagerado", "Desordenado"], correcta: 1 },
 { pregunta: "¿Cuál es el sinónimo de ÍNTEGRO?", opciones: ["Corrupto", "Falso", "Honesto", "Deshonesto"], correcta: 2 }
];

let preguntasNivel5 = [
 { pregunta: "¿Cuál es el sinónimo de INEXORABLE?", opciones: ["Amable", "Flexible", "Implacable", "Dudoso"], correcta: 2 },
 { pregunta: "¿Cuál es el sinónimo de SAGAZ?", opciones: ["Torpe", "Astuto", "Ingenuo", "Despistado"], correcta: 1 },
 { pregunta: "¿Cuál es el sinónimo de ECUÁNIME?", opciones: ["Furioso", "Injusto", "Único", "Equilibrado"], correcta: 3 },
 { pregunta: "¿Cuál es el sinónimo de ELOCUENTE?", opciones: ["Confuso", "Expresivo", "Tímido", "Silencioso"], correcta: 1 },
 { pregunta: "¿Cuál es el sinónimo de VASTO?", opciones: ["Reducido", "Estrecho", "Pequeño", "Inmenso"], correcta: 3 },
 { pregunta: "¿Cuál es el sinónimo de PRÓDIGO?", opciones: ["Avaro", "Generoso", "Escaso", "Tacaño"], correcta: 1 },
 { pregunta: "¿Cuál es el sinónimo de RECÍPROCO?", opciones: ["Contrario", "Individual", "Único", "Mutuo"], correcta: 3 },
 { pregunta: "¿Cuál es el sinónimo de PERTINENTE?", opciones: ["Inútil", "Adecuado", "Extraño", "Incorrecto"], correcta: 1 },
 { pregunta: "¿Cuál es el sinónimo de INTRÉPIDO?", opciones: ["Audaz", "Inseguro", "Temeroso", "Cobarde"], correcta: 0 },
 { pregunta: "¿Cuál es el sinónimo de VEROSÍMIL?", opciones: ["Incierto", "Falso", "Creíble", "Imposible"], correcta: 2 }
];

// ==================================================
// 🐼 JUEGO DE ANTÓNIMOS
// ==================================================
const preguntasAntonimosNivel1 = [
 { pregunta: "¿Cuál es el antónimo de FELIZ?", opciones: ["Alegre", "Triste", "Contento", "Divertido"], correcta: 1 },
 { pregunta: "¿Cuál es el antónimo de GRANDE?", opciones: ["Enorme", "Gigante", "Pequeño", "Amplio"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de RÁPIDO?", opciones: ["Veloz", "Lento", "Ágil", "Ligero"], correcta: 1 },
 { pregunta: "¿Cuál es el antónimo de CALIENTE?", opciones: ["Tibio", "Frío", "Ardiente", "Caluroso"], correcta: 1 },
 { pregunta: "¿Cuál es el antónimo de ALTO?", opciones: ["Grande", "Largo", "Bajo", "Enorme"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de BONITO?", opciones: ["Hermoso", "Feo", "Agradable", "Lindo"], correcta: 1 },
 { pregunta: "¿Cuál es el antónimo de FUERTE?", opciones: ["Potente", "Débil", "Resistente", "Robusto"], correcta: 1 },
 { pregunta: "¿Cuál es el antónimo de CERCA?", opciones: ["Junto", "Lejos", "Próximo", "Cercano"], correcta: 1 },
 { pregunta: "¿Cuál es el antónimo de ABRIR?", opciones: ["Cerrar", "Destapar", "Levantar", "Mostrar"], correcta: 0 },
 { pregunta: "¿Cuál es el antónimo de ENTRAR?", opciones: ["Llegar", "Pasar", "Salir", "Avanzar"], correcta: 2 }
];

const preguntasAntonimosNivel2 = [
 { pregunta: "¿Cuál es el antónimo de VALIENTE?", opciones: ["Audaz", "Cobarde", "Atrevido", "Intrépido"], correcta: 1 },
 { pregunta: "¿Cuál es el antónimo de GENEROSO?", opciones: ["Amable", "Bondadoso", "Tacaño", "Solidario"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de COMENZAR?", opciones: ["Iniciar", "Empezar", "Continuar", "Terminar"], correcta: 3 },
 { pregunta: "¿Cuál es el antónimo de FÁCIL?", opciones: ["Sencillo", "Simple", "Difícil", "Cómodo"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de LIMPIO?", opciones: ["Ordenado", "Sucio", "Brillante", "Pulcro"], correcta: 1 },
 { pregunta: "¿Cuál es el antónimo de AMABLE?", opciones: ["Cariñoso", "Educado", "Hostil", "Agradable"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de SILENCIOSO?", opciones: ["Callado", "Tranquilo", "Ruidoso", "Sereno"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de GANAR?", opciones: ["Triunfar", "Vencer", "Perder", "Celebrar"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de LLENO?", opciones: ["Completo", "Vacío", "Grande", "Pesado"], correcta: 1 },
 { pregunta: "¿Cuál es el antónimo de RECORDAR?", opciones: ["Pensar", "Olvidar", "Aprender", "Conocer"], correcta: 1 }
];

const preguntasAntonimosNivel3 = [
 { pregunta: "¿Cuál es el antónimo de ABUNDANTE?", opciones: ["Numeroso", "Escaso", "Excesivo", "Suficiente"], correcta: 1 },
 { pregunta: "¿Cuál es el antónimo de PRECISO?", opciones: ["Exacto", "Correcto", "Impreciso", "Seguro"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de SERENO?", opciones: ["Tranquilo", "Calmado", "Nervioso", "Pacífico"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de HUMILDE?", opciones: ["Sencillo", "Modesto", "Vanidoso", "Respetuoso"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de PERMANENTE?", opciones: ["Duradero", "Temporal", "Estable", "Continuo"], correcta: 1 },
 { pregunta: "¿Cuál es el antónimo de ACEPTAR?", opciones: ["Admitir", "Recibir", "Rechazar", "Permitir"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de CONOCIDO?", opciones: ["Famoso", "Popular", "Desconocido", "Reconocido"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de VALIOSO?", opciones: ["Importante", "Precioso", "Insignificante", "Útil"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de INICIAR?", opciones: ["Comenzar", "Empezar", "Finalizar", "Continuar"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de EXPANDIR?", opciones: ["Extender", "Aumentar", "Reducir", "Ampliar"], correcta: 2 }
];

const preguntasAntonimosNivel4 = [
 { pregunta: "¿Cuál es el antónimo de EFÍMERO?", opciones: ["Pasajero", "Breve", "Duradero", "Momentáneo"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de PERSPICAZ?", opciones: ["Astuto", "Ingenuo", "Inteligente", "Sagaz"], correcta: 1 },
 { pregunta: "¿Cuál es el antónimo de CAUTELOSO?", opciones: ["Prudente", "Cuidadoso", "Imprudente", "Precavido"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de BENÉVOLO?", opciones: ["Bondadoso", "Amable", "Malévolo", "Generoso"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de INUSUAL?", opciones: ["Extraño", "Raro", "Habitual", "Insólito"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de TENAZ?", opciones: ["Perseverante", "Constante", "Inconstante", "Persistente"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de PRÓSPERO?", opciones: ["Exitoso", "Afortunado", "Desafortunado", "Rico"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de HOSTIL?", opciones: ["Agresivo", "Amistoso", "Enemigo", "Violento"], correcta: 1 },
 { pregunta: "¿Cuál es el antónimo de SOBRIO?", opciones: ["Moderado", "Sencillo", "Excesivo", "Sereno"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de ÍNTEGRO?", opciones: ["Honesto", "Correcto", "Corrupto", "Justo"], correcta: 2 }
];

const preguntasAntonimosNivel5 = [
 { pregunta: "¿Cuál es el antónimo de INEXORABLE?", opciones: ["Implacable", "Flexible", "Inevitable", "Riguroso"], correcta: 1 },
 { pregunta: "¿Cuál es el antónimo de SAGAZ?", opciones: ["Astuto", "Perspicaz", "Ingenuo", "Inteligente"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de ECUÁNIME?", opciones: ["Justo", "Equilibrado", "Imparcial", "Injusto"], correcta: 3 },
 { pregunta: "¿Cuál es el antónimo de ELOCUENTE?", opciones: ["Expresivo", "Silencioso", "Persuasivo", "Comunicativo"], correcta: 1 },
 { pregunta: "¿Cuál es el antónimo de VASTO?", opciones: ["Inmenso", "Amplio", "Reducido", "Extenso"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de PRÓDIGO?", opciones: ["Generoso", "Dadivoso", "Avaro", "Desprendido"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de RECÍPROCO?", opciones: ["Mutuo", "Correspondiente", "Individual", "Compartido"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de PERTINENTE?", opciones: ["Adecuado", "Oportuno", "Impertinente", "Relacionado"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de INTRÉPIDO?", opciones: ["Audaz", "Valiente", "Temeroso", "Osado"], correcta: 2 },
 { pregunta: "¿Cuál es el antónimo de VEROSÍMIL?", opciones: ["Creíble", "Probable", "Inverosímil", "Posible"], correcta: 2 }
];

// ==============================
// 📝 ORACIONES SIMPLES
// ==============================
let preguntasOracionesNivel1 = [
 { pregunta: "Ordena las palabras: juega / Panchita / con / su / pelota", opciones: ["Panchita juega con su pelota", "Juega pelota Panchita con su", "Su pelota con Panchita juega", "Con su juega pelota Panchita"], correcta: 0 },
 { pregunta: "Ordena las palabras: come / María / una / manzana", opciones: ["Una María come manzana", "María come una manzana", "Come María una manzana", "Manzana una come María"], correcta: 1 },
 { pregunta: "Ordena las palabras: corre / el / perro / rápido", opciones: ["El perro corre rápido", "Rápido corre el perro", "Corre rápido el perro", "Perro el rápido corre"], correcta: 0 },
 { pregunta: "Ordena las palabras: estudia / Ana / matemáticas", opciones: ["Matemáticas Ana estudia", "Estudia matemáticas Ana", "Ana estudia matemáticas", "Ana matemáticas estudia"], correcta: 2 },
 { pregunta: "Ordena las palabras: canta / Panchita / una / canción", opciones: ["Una canción Panchita canta", "Panchita canta una canción", "Canta una Panchita canción", "Canción canta Panchita una"], correcta: 1 }
];

let preguntasOracionesNivel2 = [
 { pregunta: "¿Cuál es el SUJETO? — El niño juega en el parque.", opciones: ["juega", "en el parque", "El niño", "parque"], correcta: 2 },
 { pregunta: "¿Cuál es el SUJETO? — María lee un libro.", opciones: ["lee", "María", "un libro", "libro"], correcta: 1 },
 { pregunta: "¿Cuál es el SUJETO? — El perro corre rápido.", opciones: ["corre", "rápido", "El perro", "perro corre"], correcta: 2 },
 { pregunta: "¿Cuál es el SUJETO? — Los estudiantes estudian.", opciones: ["estudian", "Los estudiantes", "estudiantes estudian", "Los"], correcta: 1 },
 { pregunta: "¿Cuál es el SUJETO? — Panchita come bambú.", opciones: ["come", "bambú", "Panchita", "come bambú"], correcta: 2 }
];

let preguntasOracionesNivel3 = [
 { pregunta: "¿Cuál es el VERBO? — El niño corre en el parque.", opciones: ["niño", "parque", "corre", "El"], correcta: 2 },
 { pregunta: "¿Cuál es el VERBO? — María estudia matemáticas.", opciones: ["María", "estudia", "matemáticas", "María estudia"], correcta: 1 },
 { pregunta: "¿Cuál es el VERBO? — El gato duerme en la cama.", opciones: ["gato", "cama", "duerme", "El gato"], correcta: 2 },
 { pregunta: "¿Cuál es el VERBO? — Pedro escribe una carta.", opciones: ["Pedro", "carta", "escribe", "una"], correcta: 2 },
 { pregunta: "¿Cuál es el VERBO? — Panchita juega feliz.", opciones: ["Panchita", "feliz", "juega", "Panchita juega"], correcta: 2 }
];

let preguntasOracionesNivel4 = [
 { pregunta: "Completa: El perro ______ en el jardín.", opciones: ["corre", "azul", "casa", "bonito"], correcta: 0 },
 { pregunta: "Completa: María ______ un libro.", opciones: ["libro", "lee", "bonita", "mesa"], correcta: 1 },
 { pregunta: "Completa: Los niños ______ en el parque.", opciones: ["juegan", "parque", "felices", "pelota"], correcta: 0 },
 { pregunta: "Completa: Panchita ______ bambú.", opciones: ["verde", "bambú", "come", "grande"], correcta: 2 },
 { pregunta: "Completa: Mi mamá ______ la comida.", opciones: ["cocina", "comida", "rica", "cocina la"], correcta: 0 }
];

let preguntasOracionesNivel5 = [
 { pregunta: "¿Cuál oración está correctamente escrita?", opciones: ["Panchita juega en el parque.", "Panchita en juega parque el.", "Juega Panchita parque el.", "Parque Panchita el juega."], correcta: 0 },
 { pregunta: "¿Cuál oración tiene SUJETO y VERBO correctamente?", opciones: ["Corre rápidamente.", "El niño estudia.", "Estudia matemáticas.", "En el parque."], correcta: 1 },
 { pregunta: "¿Cuál es una oración simple?", opciones: ["María estudia.", "María estudia y Pedro juega.", "Cuando María llega, Pedro sale.", "Aunque llueva, iremos."], correcta: 0 },
 { pregunta: "¿Cuál oración está correctamente ordenada?", opciones: ["Come bambú Panchita.", "Panchita come bambú.", "Bambú Panchita come.", "Come Panchita bambú."], correcta: 1 },
 { pregunta: "¿Cuál oración tiene sentido completo?", opciones: ["El perro", "Corre por", "El perro corre.", "En el parque"], correcta: 2 }
];

//==================================================
// FUNCIONES DEL JUEGO
//==================================================

function abrirJuego(tipo, reiniciar=false){
    detenerTemporizador();
    permitirSonidosJuego = true;
    actividadCompletada = false;
    tipoJuego = tipo;
    respuestaBloqueada = false;
    const datosGuardados = leerProgresos()[tipo];
    if (!reiniciar && datosGuardados && !datosGuardados.completado && Array.isArray(datosGuardados.preguntas)) {
        nivel = datosGuardados.nivel || 1;
        puntos = datosGuardados.puntos || 0;
        vidas = Math.max(1, Number(datosGuardados.vidas) || 3);
        preguntaActual = datosGuardados.preguntaActual || 0;
        preguntas = JSON.parse(JSON.stringify(datosGuardados.preguntas));
    } else {
        nivel = 1; puntos = 0; vidas = 3; preguntaActual = 0;
        if(tipo === "sinonimos") preguntas = JSON.parse(JSON.stringify(preguntasNivel1));
        else if(tipo === "antonimos") preguntas = JSON.parse(JSON.stringify(preguntasAntonimosNivel1));
        else if(tipo === "oraciones") preguntas = JSON.parse(JSON.stringify(preguntasOracionesNivel1));
        if (reiniciar) borrarProgreso(tipo);
    }
    const titulos = { sinonimos: "📚 Juego de Sinónimos", antonimos: "🔄 Juego de Antónimos", oraciones: "📝 Juego de Oraciones Simples" };
    document.getElementById("tituloJuego").innerHTML = titulos[tipo] || "🐼 Jugando con Panchita";
    document.getElementById("progreso").style.width = (preguntaActual / Math.max(1, preguntas.length) * 100) + "%";
    document.getElementById("pantallaJuego").style.display = "block";
    prepararControlesJuego();
    actualizarInterfazCompleta();
    document.getElementById("pantallaJuego").scrollIntoView({ behavior: "smooth" });
    iniciarAudio();
    if (sonidoActivado && audioContexto) iniciarMusica("juego");
    cargarPregunta();
}

// Actualizar los marcadores que están en la interfaz del juego
function actualizarMarcadoresJuego() {
    document.getElementById("nivelActual").innerHTML = nivel;
    document.getElementById("puntajeJuego").innerHTML = puntos;
    document.getElementById("vidas").innerHTML = vidas;
}

// Actualizar el panel de "Tu progreso" arriba de la página
function actualizarProgresoGeneral(enMenu = false) {
    let puntosMostrar = puntos;
    let nivelMostrar = nivel;

    // En el menú se resume el avance guardado de las tres actividades.
    if (enMenu) {
        const guardados = leerProgresos();
        const actividades = Object.values(guardados);
        puntosMostrar = actividades.reduce((total, dato) => total + (Number(dato.puntos) || 0), 0);
        nivelMostrar = actividades.reduce((mayor, dato) => Math.max(mayor, Number(dato.nivelMaximo || dato.nivel) || 1), 1);
    }

    const puntosElemento = document.getElementById("progresoPuntos");
    const nivelElemento = document.getElementById("progresoNivel");
    const estrellasElemento = document.getElementById("progresoEstrellas");
    if (!puntosElemento || !nivelElemento || !estrellasElemento) return;

    puntosElemento.textContent = puntosMostrar;
    nivelElemento.textContent = "Nivel " + nivelMostrar;

    let estrellasHTML = "⭐";
    if (puntosMostrar >= 200) estrellasHTML = "⭐⭐⭐⭐⭐";
    else if (puntosMostrar >= 120) estrellasHTML = "⭐⭐⭐⭐";
    else if (puntosMostrar >= 80) estrellasHTML = "⭐⭐⭐";
    else if (puntosMostrar >= 40) estrellasHTML = "⭐⭐";

    estrellasElemento.innerHTML = estrellasHTML;
}

// Actualizar todos los datos visuales
function actualizarInterfazCompleta() {
    actualizarMarcadoresJuego();
    actualizarProgresoGeneral();
}

function mezclarOpciones(pregunta){
    let opcionesMezcladas = pregunta.opciones.map((texto, indice) => ({
        texto: texto,
        correcta: indice === pregunta.correcta
    }));

    opcionesMezcladas.sort(() => Math.random() - 0.5);
    pregunta.opciones = opcionesMezcladas.map(opcion => opcion.texto);
    pregunta.correcta = opcionesMezcladas.findIndex(opcion => opcion.correcta);
}

function cargarPregunta() {
    let p = preguntas[preguntaActual];
    if (!p) return;
    respuestaBloqueada = false;
    mezclarOpciones(p);
    actualizarMarcadoresJuego();
    document.getElementById("pregunta").innerHTML = p.pregunta;
    [0,1,2,3].forEach(i => {
        const boton = document.getElementById("r" + i);
        boton.innerHTML = p.opciones[i];
        boton.disabled = false;
    });
    document.getElementById("mensajePanchita").innerHTML = "🐼 ¡Escoge la respuesta correcta!";
    document.getElementById("mensajePanchita").style.color = "#4d9f3a";
    guardarProgreso();
    iniciarTemporizador();
}
function detenerTemporizador() { clearInterval(temporizador); temporizador = null; }
function iniciarTemporizador() {
    detenerTemporizador();
    tiempoRestante = 15;
    const reloj = document.getElementById("tiempo");
    if (!reloj) return;
    reloj.textContent = tiempoRestante;
    temporizador = setInterval(() => {
        tiempoRestante--;
        reloj.textContent = tiempoRestante;
        if (tiempoRestante <= 0) { detenerTemporizador(); responder(-1); }
    }, 1000);
}
function responder(opcion){
    if (respuestaBloqueada || !preguntas[preguntaActual]) return;
    respuestaBloqueada = true;
    detenerTemporizador();
    const correcta = preguntas[preguntaActual].correcta;
    const mensaje = document.getElementById("mensajePanchita");
    if(opcion === correcta){
        puntos += 10;
        mensaje.innerHTML = "🐼 ¡Excelente! ¡Respuesta correcta! ⭐";
        mensaje.style.color = "#4CAF50";
        sonidoCorrecto();
    } else {
        vidas--;
        mensaje.innerHTML = opcion === -1 ? "⏰ ¡Se acabó el tiempo!" : "🐼 ¡Casi! La respuesta correcta era: " + preguntas[preguntaActual].opciones[correcta];
        mensaje.style.color = "#bb4555";
        sonidoIncorrecto();
    }
    [0,1,2,3].forEach(i => document.getElementById("r"+i).disabled = true);
    actualizarInterfazCompleta();
    guardarProgreso();
    if(vidas <= 0){ setTimeout(mostrarGameOver, 850); return; }
    preguntaActual++;
    document.getElementById("progreso").style.width = ((preguntaActual / preguntas.length) * 100) + "%";
    if(preguntaActual >= preguntas.length){
        let subioDeNivel = false;
        preguntaActual = 0;
        document.getElementById("progreso").style.width = "0%";
        if(tipoJuego === "oraciones"){
            if(nivel===1){nivel=2;preguntas=JSON.parse(JSON.stringify(preguntasOracionesNivel2));subioDeNivel=true;}
            else if(nivel===2){nivel=3;preguntas=JSON.parse(JSON.stringify(preguntasOracionesNivel3));subioDeNivel=true;}
            else if(nivel===3){nivel=4;preguntas=JSON.parse(JSON.stringify(preguntasOracionesNivel4));subioDeNivel=true;}
            else if(nivel===4){nivel=5;preguntas=JSON.parse(JSON.stringify(preguntasOracionesNivel5));subioDeNivel=true;}
        } else if(tipoJuego === "sinonimos"){
            if(nivel===1){nivel=2;preguntas=JSON.parse(JSON.stringify(preguntasNivel2));subioDeNivel=true;}
            else if(nivel===2){nivel=3;preguntas=JSON.parse(JSON.stringify(preguntasNivel3));subioDeNivel=true;}
            else if(nivel===3){nivel=4;preguntas=JSON.parse(JSON.stringify(preguntasNivel4));subioDeNivel=true;}
            else if(nivel===4){nivel=5;preguntas=JSON.parse(JSON.stringify(preguntasNivel5));subioDeNivel=true;}
        } else if(tipoJuego === "antonimos"){
            if(nivel===1){nivel=2;preguntas=JSON.parse(JSON.stringify(preguntasAntonimosNivel2));subioDeNivel=true;}
            else if(nivel===2){nivel=3;preguntas=JSON.parse(JSON.stringify(preguntasAntonimosNivel3));subioDeNivel=true;}
            else if(nivel===3){nivel=4;preguntas=JSON.parse(JSON.stringify(preguntasAntonimosNivel4));subioDeNivel=true;}
            else if(nivel===4){nivel=5;preguntas=JSON.parse(JSON.stringify(preguntasAntonimosNivel5));subioDeNivel=true;}
        }
        if(subioDeNivel){
            actualizarInterfazCompleta(); guardarProgreso();
            mostrarMensajeNivel(
                "🎉 ¡Muy bien! ¡Pasaste al nivel " + nivel + "!",
                "🐼 ¡Desbloqueaste un nuevo nivel! Ahora te esperan preguntas diferentes. ¡Sigue aprendiendo con Panchita!",
                cargarPregunta
            );
        } else {
            // Mantener guardado que esta actividad ya fue completada.
            actividadCompletada = true;
            guardarProgreso(true);
            actualizarProgresoGeneral(true);
            mostrarFinActividad(true);
        }
        return;
    }
    guardarProgreso();
    setTimeout(cargarPregunta, 850);
}
function cerrarJuego() {
    volverMenuJuegos();
}
function mostrarFinActividad(completado) {
    detenerTemporizador();
    document.getElementById("gameOverPanchita")?.remove();
    const modal = document.createElement("div");
    modal.id = "gameOverPanchita";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(20,17,55,.82);display:flex;align-items:center;justify-content:center;padding:18px;z-index:99999;font-family:'Fredoka',sans-serif;overflow:auto;";
    modal.innerHTML = `<div style="width:100%;max-width:420px;max-height:90vh;overflow:auto;background:linear-gradient(145deg,#29245E,#4541A3);border:2px solid rgba(255,255,255,.25);border-radius:28px;padding:24px 20px;text-align:center;color:white;box-shadow:0 15px 45px rgba(0,0,0,.35);box-sizing:border-box;">
      <div style="font-size:58px">🐼</div><h2 style="color:#FFE47A">${completado ? "¡FELICIDADES! 🎉" : "¡Cada intento cuenta!"}</h2>
      <p>${completado ? "¡Terminaste los cinco niveles! Elige otra aventura para seguir aprendiendo." : "Puedes volver a intentarlo o elegir otra actividad."}</p>
      <p style="font-size:30px;color:#FFE47A">⭐ ${puntos} puntos</p>
      <button id="reintentarPanchita" style="width:100%;padding:13px;border:0;border-radius:15px;background:#FFE47A;color:#30285E;font-family:inherit;font-size:16px;font-weight:bold;margin:6px 0;cursor:pointer">🔄 Volver a intentar</button>
      <div style="display:flex;flex-wrap:wrap;gap:7px;justify-content:center">${botonesOtrasActividades()}</div>
      <button id="volverJuegosPanchita" style="width:100%;padding:12px;border:2px solid rgba(255,255,255,.4);border-radius:15px;background:transparent;color:white;font-family:inherit;font-size:15px;font-weight:bold;margin-top:10px;cursor:pointer">🏠 Menú principal</button>
    </div>`;
    document.body.appendChild(modal);
    document.getElementById("reintentarPanchita").onclick = () => { modal.remove(); abrirJuego(tipoJuego, true); };
    document.getElementById("volverJuegosPanchita").onclick = () => { modal.remove(); volverMenuJuegos(); };
}

//==============================
// 🐼 MOSTRAR / CERRAR INFO
//==============================

function mostrarInfo(id) {
    const elemento = document.getElementById(id);
    if (!elemento) return;

    document.querySelectorAll(".info-panchita").forEach(function(info) {
        info.style.display = "none";
    });

    elemento.style.display = "block";
    elemento.scrollIntoView({ behavior: "smooth", block: "center" });
}

function cerrarInfo(id) {
    const elemento = document.getElementById(id);
    if (elemento) {
        elemento.style.display = "none";
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
}

function respuestaInfo(boton, correcta) {
    const resultado = boton.parentElement.querySelector(".resultado-info");
    if (correcta) {
        resultado.innerHTML = "🎉 ¡MUY BIEN! 🐼⭐<br>¡Panchita está orgullosa de ti!";
    } else {
        resultado.innerHTML = "🤔 ¡Casi! 🐼💡<br>¡Inténtalo nuevamente!";
    }
}

function mostrarMensajeNivel(titulo, mensaje, continuar) {
    const anterior = document.getElementById("mensajeNivelBonito");
    if (anterior) anterior.remove();

    const ventana = document.createElement("div");
    ventana.id = "mensajeNivelBonito";
    ventana.innerHTML = `
        <div class="tarjeta-nivel">
            <div class="panda-nivel">🐼</div>
            <h2>${titulo}</h2>
            <p>${mensaje}</p>
            <p class="felicitacion">¡Panchita está orgullosa de ti! 🌟</p>
            <button id="continuarNivelBonito">¡CONTINUAR! 💗</button>
        </div>
    `;

    ventana.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(210, 232, 244, 0.65);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 99999;
        padding: 20px;
    `;

    document.body.appendChild(ventana);

    const tarjeta = ventana.querySelector(".tarjeta-nivel");
    tarjeta.style.cssText = `
        background: linear-gradient(145deg, #e0ecf7ba, #dad8e8);
        border: 4px solid white;
        border-radius: 28px;
        padding: 30px 24px;
        width: 100%;
        max-width: 380px;
        text-align: center;
        box-shadow: 0 12px 35px rgba(0,0,0,.25);
        font-family: 'Fredoka', sans-serif;
        animation: aparecerPanchita .35s ease;
    `;

    ventana.querySelector(".panda-nivel").style.fontSize = "65px";

    ventana.querySelector("h2").style.color = "#882aa0";
    ventana.querySelector("h2").style.fontSize = "27px";

    ventana.querySelectorAll("p").forEach(p => {
        p.style.color = "#080212";
        p.style.fontSize = "17px";
    });

    ventana.querySelector("button").style.cssText = `
        background: linear-gradient(90deg, #e780ad, #a34096);
        color: white;
        border: none;
        border-radius: 30px;
        padding: 14px 28px;
        font-size: 17px;
        font-weight: bold;
        cursor: pointer;
        margin-top: 10px;
    `;

    ventana.querySelector("#continuarNivelBonito").onclick = () => {
        ventana.remove();
        continuar();
    };
}

function mostrarGameOver() {
    detenerTemporizador();
    guardarProgreso();
    mostrarFinActividad(false);
}


// Recuperar el resumen guardado al abrir o actualizar la página.
function cargarResumenGuardadoPanchita() {
    actualizarProgresoGeneral(true);
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", cargarResumenGuardadoPanchita, { once: true });
} else {
    cargarResumenGuardadoPanchita();
}
