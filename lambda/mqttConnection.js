const mqtt = require('mqtt');
const jwt = require('jsonwebtoken');
const fs = require('fs')
const path = require('path');
const crypto = require('crypto');
//const responseTopic = 'eltecwifimedico/devices/7cdfa1e48805/state';
// URL y credenciales utilizadas para autenticar la conexión segura con el broker.
const brokerUrl = 'mqtts://broker.solkos.com.mx:8083';
const username = 'F412FAC14F59';
//const topicCommand = 'eltecwifimedico/devices/7cdfa1e48805/commands';
const handShake = '5A4021';
const Dispositivo = '4827E2D2C591';
const commandUnlock = '5A405E';
const privateKey = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg/P0UOh8vmJVoDQKw
DjS+P7lpABiZ6jjM9dd+p8+6BgmhRANCAAREz/s66mf/7dQ0py13hX5kvChC6s2F
ICMzaXM9YGi4RqXXso9CPM/84djJg4DbHa2UmkSHGH72n1dBYAdUInK9
-----END PRIVATE KEY-----`;

//const clientId = `device-${Math.random().toString(16).substring(2, 12)}`;
const certPath = path.join(__dirname, 'certs', 'ca_isrg.pem');
const caCert = fs.readFileSync(certPath);
// Cliente MQTT activo; se comparte entre las funciones de este módulo.
let mqttClientConnect;

// Crea credenciales nuevas para cada conexión para no reutilizar un JWT vencido
// ni un clientId que pudiera seguir activo en el broker.
function createConnectionOptions() {
    const iat = Math.floor(Date.now() / 1000);
    const token = jwt.sign({
        device_id: username,
        iat,
        exp: iat + 1200
    }, privateKey, { algorithm: 'ES256' });

    return {
        username,
        password: token,
        clientId: `device-${crypto.randomBytes(5).toString('hex')}`,
        ca: caCert,
        rejectUnauthorized: true,
        connectTimeout: 5000,
        // No combina reintentos internos con reintentos manuales; la siguiente
        // directiva de Alexa inicia un cliente nuevo con token y clientId nuevos.
        reconnectPeriod: 0
    };
}

function closeClient(client) {
    if (!client) return;
    if (mqttClientConnect === client) mqttClientConnect = null;
    client.end(true);
}

// Abre la conexión MQTT y se suscribe al tópico de estado del refrigerador.
function connectToMQTT(endpointId) {
    // Cierra una conexión anterior antes de iniciar otra para este endpoint.
    if (mqttClientConnect) {
        console.log("Cerrando conexión MQTT antes de reconectar...");
        closeClient(mqttClientConnect);
    }
    const responseTopic = `eltecwifimedico/devices/${endpointId}/state`;
    return new Promise((resolve, reject) => {
        const client = mqtt.connect(brokerUrl, createConnectionOptions());
        mqttClientConnect = client;
        let settled = false;

        const fail = error => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            console.error('Error de conexión MQTT:', error);
            closeClient(client);
            reject(error);
        };

        const timeout = setTimeout(() => {
            fail(new Error('Timeout al conectar o esperar el handshake MQTT'));
        }, 15000);

        client.on('error', fail);
        client.once('close', () => {
            if (!settled) fail(new Error('La conexión MQTT se cerró antes de completar el handshake'));
        });
        client.once('connect', () => {
            console.log('Conectado al broker MQTT');
            client.subscribe(responseTopic, async error => {
                if (error) {
                    fail(error);
                    return;
                }

                console.log(`Suscrito al tópico de respuesta ${responseTopic}`);
                try {
                    // Registra la espera de respuesta antes de publicar el handshake.
                    await publishMQTTCommand(
                        '5A4021',
                        `eltecwifimedico/devices/${endpointId}/commands`,
                        endpointId
                    );
                    if (!settled) {
                        settled = true;
                        clearTimeout(timeout);
                        resolve(client);
                    }
                } catch (handshakeError) {
                    fail(handshakeError);
                }
            });
        });
    });
}






function disconnectFromMQTT() {
    if (mqttClientConnect) {
        console.log('Desconectando del broker MQTT...');
        const client = mqttClientConnect;
        closeClient(client);
        console.log('Conexión cerrada');
    } else {
        console.log('No hay conexión activa para desconectar.');
    }
}


// Publica un comando hexadecimal y espera un mensaje en el tópico de estado.
function publishMQTTCommand(commandString, topic, endpointId) {
    const commandBytes = convertBytes(commandString);
    const responseTopic = `eltecwifimedico/devices/${endpointId}/state`;
    return new Promise((resolve, reject) => {
        const client = mqttClientConnect;
        if (!client || !client.connected) {
            reject(new Error('No hay una conexión MQTT activa para publicar el comando'));
            return;
        }

        let settled = false;
        const cleanup = () => {
            clearTimeout(timeout);
            client.removeListener('message', onMessage);
            client.removeListener('error', onError);
            client.removeListener('close', onClose);
        };
        const finish = (error, message) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (error) reject(error);
            else resolve(message);
        };
        const onMessage = (receivedTopic, message) => {
            if (receivedTopic !== responseTopic) return;
            console.log(`Message received on topic ${responseTopic}`);
            handleReceivedMessage(message);
            finish(null, message);
        };
        const onError = error => finish(error);
        const onClose = () => finish(new Error('La conexión MQTT se cerró antes de recibir respuesta'));
        const timeout = setTimeout(() => {
            finish(new Error(`Timeout esperando respuesta MQTT en ${responseTopic}`));
        }, 10000);

        // La escucha queda instalada antes de publicar para no perder respuestas rápidas.
        client.on('message', onMessage);
        client.once('error', onError);
        client.once('close', onClose);
        client.publish(topic, commandBytes, error => {
            if (error) {
                console.error('Error al publicar el mensaje:', error);
                finish(error);
            } else {
                console.log(`Mensaje ${commandString} publicado en el tópico ${topic}`);
            }
        });
    });
}


async function turnOnOff (endpointId){
    // Comando base de control de encendido/apagado definido por el protocolo del equipo.
    console.log("se envio estado de la lampara");
    const strSend = "405604000000";
    const checksum = checkSum(strSend);
    console.log(`Checksum: ${checksum}`);
    const arrSend = ["5A4056", "04", "00", "00", "00", checksum];
    return comunication(arrSend, endpointId);
}

// Selecciona el comando base o uno alternativo de desactivación si se proporciona.
// Actualmente los modos no pasan un comando alternativo, así que ON y OFF producen
// el mismo comando MQTT; el protocolo debe confirmarse para diferenciarlos.
function resolveToggleCommand(baseCommandHex, enabled = true, disableCommandHex = null) {
    return enabled ? baseCommandHex : (disableCommandHex || baseCommandHex);
}

// Envía los comandos del protocolo asociados a cada modo del refrigerador.
async function modoNocturno(endpointId, enabled = true){
    console.log(`se envio modo nocturno (${enabled ? 'ON' : 'OFF'})`);
    const strSend = resolveToggleCommand("405602000000", enabled);
    const checksum = checkSum(strSend);
    console.log(`Checksum: ${checksum}`);
    const arrSend = ["5A4056", "02", "00", "00", "00", checksum];
    return comunication(arrSend, endpointId);
}

async function bloqueoHealth(endpointId, enabled = true){
    console.log(`bloqueo de refrigerador (${enabled ? 'ON' : 'OFF'})`);
    const strSend = resolveToggleCommand("405601000000", enabled);
    const checksum = checkSum(strSend);
    console.log(`Checksum: ${checksum}`);
    const arrSend = ["5A4056", "01", "00", "00", "00", checksum];
    return comunication(arrSend, endpointId);
}

async function modoAhorro2(endpointId, enabled = true){
    console.log(`modo ahorro (${enabled ? 'ON' : 'OFF'})`);
    const strSend = resolveToggleCommand("405608000000", enabled);
    const checksum = checkSum(strSend);
    console.log(`Checksum: ${checksum}`);
    const arrSend = ["5A4056", "08", "00", "00", "00", checksum];
    return comunication(arrSend, endpointId);
}

 async function estadoReset(endpointId, enabled = true) {
    console.log(`reset del dispositivo (${enabled ? 'ON' : 'OFF'})`);
    const strSend = resolveToggleCommand("405610000000", enabled);
    const checksum = checkSum(strSend);
    console.log(`Checksum: ${checksum}`);
    const arrSend = ["5A4056", "10", "00", "00", "00", checksum];
    return comunication(arrSend, endpointId);
}

async function silencioBuzzer(endpointId, enabled = true) { 
    console.log(`silencio del buzzer (${enabled ? 'ON' : 'OFF'})`);
    const strSend = resolveToggleCommand("405620000000", enabled);
    const checksum = checkSum(strSend);
    console.log(`Checksum: ${checksum}`);
    const arrSend = ["5A4056", "20", "00", "00", "00", checksum];
    return comunication(arrSend, endpointId);
}

async function releCerradura(endpointId, enabled = true) {
    console.log(`relé de cerradura (${enabled ? 'ON' : 'OFF'})`);
    const strSend = resolveToggleCommand("405640000000", enabled);
    const checksum = checkSum(strSend);
    console.log(`Checksum: ${checksum}`);
    const arrSend = ["5A4056", "40", "00", "00", "00", checksum];
    return comunication(arrSend, endpointId);
}

// Punto de entrada para procesar los mensajes recibidos del dispositivo.
function handleReceivedMessage(message) {

    console.log('Data received (Buffer):', message);
     
}

// Suma los bytes hexadecimales del cuerpo del comando y devuelve el checksum.
function checkSum(strSend) {
    const hexa = chunkString(strSend, 2);
    let checksum = 0;
    for (const hexa2 of hexa) {
        checksum += hexToDecimal(hexa2);
    }
    let strChecksum = checksum.toString(16).toUpperCase();
    strChecksum = strChecksum.padStart(8, '0');
    return strChecksum;
}

// Une las partes del paquete y las publica en el tópico de comandos del endpoint.
async function comunication(arr,endpointId) {
    const sendData = arr.join('');
    console.log("Cadena a enviar:", sendData);
    return publishMQTTCommand(sendData, `eltecwifimedico/devices/${endpointId}/commands`, endpointId);
}

// Convierte un byte hexadecimal a su valor numérico.
function hexToDecimal(hex) {
    return parseInt(hex, 16);
}

// Convierte una cadena hexadecimal en un Buffer para enviarlo mediante MQTT.
function convertBytes(byteString) {
    return Buffer.from(byteString, 'hex');
}

// Divide una cadena en segmentos del tamaño indicado.
function chunkString(str, size) {
    const chunks = [];
    for (let i = 0; i < str.length; i += size) {
        chunks.push(str.slice(i, i + size));
    }
    return chunks;
}

// Funciones expuestas para que el handler de Alexa pueda controlar MQTT.
module.exports = {
    connectToMQTT,
   disconnectFromMQTT,
    publishMQTTCommand,
    handleReceivedMessage,
    turnOnOff,
    modoNocturno,
    bloqueoHealth,
    modoAhorro2,
    estadoReset,
    silencioBuzzer,
    releCerradura
    
};