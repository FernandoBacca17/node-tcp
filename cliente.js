import net from 'node:net';

const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
        const [k, ...rest] = a.replace(/^--/, "").split("=");
        return [k, rest.join("=") || true];
    })
);

const HOST = args.host || "127.0.0.1";
const PORT = Number(args.port || 4000);
const MESSAGE = args.msg ?? "hola";
const COUNT = Number(args.count || 1000);

const ENABLEDWARMUP = true;
const WARMUP = 100;

//Obtiene el tiempo actual en nanosegundos
function nowNs() {
    return process.hrtime.bigint();
}
//Convierte nanosegundos a microsegundos
function nsToUs(ns) {
    return Number(ns) / 1e3;
}

//Calcula percentiles
function percentile(sorted, p) {
    const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[i];
}
//Construye [longitud][mensaje] para enviar al servidor
function makeData(msg) {
    const payload = Buffer.from(msg, "utf8");
    const header = Buffer.alloc(4);
    header.writeUInt32BE(payload.length, 0);
    return Buffer.concat([header, payload]);
}
function messageBuild(onComplete){
    //Buffer vacío para almacenar datos recibidos
    let buff = Buffer.alloc(0);
    //Devolver función que procesa el trozo recibido
    return (chunk) => {
        //Concatena cada nuevo trozo del stream de datos
        buff = Buffer.concat([buff, chunk]);
        //Loop de procesamiento
        while(buff.length >= 4) {
            //Lee los 4 primeros bytes (Longitud del mensaje)
            const messageLength = buff.readUInt32BE(0);
            //Verifica si hay suficientes bytes para el mensaje completo
            if(buff.length < 4 + messageLength) break;
            //Si está completo extrae el mensaje y lo convierte a string UTF-8
            const message = buff.subarray(4, 4 + messageLength).toString("utf8");
            onComplete(message);
            //Elimina los bytes procesados en el buffer
            buff = buff.subarray(4 + messageLength);
        }
    }
}

(async () => {
    console.log(`Benchmark TCP secuencial`);
    console.log(`Host: ${HOST}:${PORT}`);
    console.log(`Mensaje: "${MESSAGE}"`);
    console.log(`Count: ${COUNT}`);

    if (global.gc) {
        global.gc(); // Limpia memoria antes de empezar
    }

    const sock = net.createConnection({ host: HOST, port: PORT });
    sock.setNoDelay(true);

    const parser = messageBuild(onFinishBuild);
    const data = makeData(MESSAGE);
    const rtts = [];
    let sent = 0;
    let t0;

    function sendNext() {
        if (sent >= COUNT) {
            sock.end();
            return;
        }
        //inicia el cronometro
        t0 = nowNs();
        //Envía la data [longitud] [mensaje]
        sock.write(data);
        sent++;
    }

    function onFinishBuild() {
        //Para el cronometro
        const rtt = nowNs() - t0;
        //Guarda el tiempo
        if(ENABLEDWARMUP){
            if (sent > WARMUP) {  // Solo guardar después del calentamiento (SOLUCIÓN PARA REDUCIR PICOS)
                rtts.push(rtt);
            }
        }else{
            rtts.push(rtt);
        }
        if (sent < COUNT) sendNext();
        else sock.end();
    }

    //Cuando llega la respuesta la procesa
    sock.on("data", parser);
    //Envía el primer mensaje cuando se conecta
    sock.on("connect", () => sendNext());
    //Cuando termina calcula y muestra estadísticas
    sock.on("end", () => {
        rtts.sort((a, b) => (a < b ? -1 : 1));
        const rttsUs = rtts.map(nsToUs);
        const avg = rttsUs.reduce((a, b) => a + b, 0) / rttsUs.length;

        console.log("\n──── Resultados (RTT) ────");
        console.log(`Muestras: ${rttsUs.length}`);
        console.log(`min: ${rttsUs[0].toFixed(2)} µs`);
        console.log(`p50: ${percentile(rttsUs, 50).toFixed(2)} µs`);
        console.log(`p90: ${percentile(rttsUs, 90).toFixed(2)} µs`);
        console.log(`p99: ${percentile(rttsUs, 99).toFixed(2)} µs`);
        console.log(`max: ${rttsUs[rttsUs.length - 1].toFixed(2)} µs`);
        console.log(`avg: ${avg.toFixed(2)} µs`);
    });
})();
