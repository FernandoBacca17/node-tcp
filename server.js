import net from 'node:net';

const HOST = '127.0.0.1';
const PORT = 4000;

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

//Crea servidor de eco
const server = net.createServer((socket) => {
    //Configuración para enviar datos sin esperar
    socket.setNoDelay(true);
    //Configura el constructor de mensajes con un callback
    const onData = messageBuild((message) => {
        //Convierte de texto a bytes
        const payload = Buffer.from(message, "utf8");
        //Crea una cabecera de 4 bytes con la longitud del mensaje
        const header = Buffer.alloc(4);
        header.writeUInt32BE(payload.length, 0);
        //Envía de vuelta al cliente [longitud] [mensaje]
        socket.write(Buffer.concat([header, payload]));
    });
    //Cada vez que llegue un chunk, se llama a onData
    socket.on("data", onData);
});

server.listen(PORT, HOST, () =>
    console.log(`Servidor TCP eco en ${HOST}:${PORT}`)
);
