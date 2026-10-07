// Skill de Alexa Smart Home para controlar dispositivos IoT mediante MQTT.
// Este archivo actúa como punto de entrada de la Lambda AWS y despacha
// las directivas que envía Alexa según el namespace y el nombre de la solicitud.
//
// Flujo general:
// 1) Alexa descubre dispositivos -> handleDiscovery
// 2) Alexa autoriza la conexión -> handleAuthorization
// 3) Alexa enciende/apaga el dispositivo principal -> handlePowerControl
// 4) Alexa activa modos/toggles -> handleToggleControl
// 5) Alexa solicita el estado del dispositivo -> handleReportState
//
// La comunicación con el hardware se realiza a través de mqttConnection.js,
// la autenticación/usuario se resuelve con discovery.js, y los dispositivos
// se obtienen desde la base de datos con bdConnection.js.
//const { Console } = require('console');

const mqttClient = require('./mqttConnection');
const { Discovery } = require('./discovery');
const { getDevices } = require('./apiConnection');
const { buildAlexaEndpoints } = require('./deviceMapper');
//const { connectBD } = require('./bdConnection');


// Punto de entrada de la Lambda. Esta función actúa como router de directivas.
// Dependiendo de la petición de Alexa, llama a la función correcta:
// - Alexa.Discovery / Discover
// - Alexa.Authorization / AcceptGrant
// - Alexa.PowerController / TurnOn | TurnOff
// - Alexa / ReportState
// - Alexa.ToggleController / TurnOn | TurnOff
exports.handler = async function (request, context) {
    try {
        const { namespace, name } = request.directive.header;
        console.log("Event received:", JSON.stringify(context, null, 2));
        // Descubrimiento de dispositivos
        if (namespace === 'Alexa.Discovery' && name === 'Discover') {
            console.log("DEBUG:", "Discover request", JSON.stringify(request));
            await handleDiscovery(request, context);
        } 
        else if (namespace === 'Alexa.Authorization' && name === 'AcceptGrant') {
            await handleAuthorization(request, context);
        }
        // Control de encendido y apagado
        else if (namespace === 'Alexa.PowerController' && (name === 'TurnOn' || name === 'TurnOff')) {
            console.log("DEBUG:", "TurnOn or TurnOff Request", JSON.stringify(request));
            await handlePowerControl(request, context);
        }
        // Solicitudes de ReportState obtiene el esrtado del dispositivo
        else if (namespace === 'Alexa' && name === 'ReportState') {
            console.log("DEBUG:", "ReportState Request", JSON.stringify(request));
            await handleReportState(request, context);
        }
        else if (namespace === 'Alexa.ToggleController' && (name === 'TurnOn' || name === 'TurnOff')) {
            console.log("DEBUG:", "ToggleController Request", JSON.stringify(request));
            await handleToggleControl(request, context);
        }

    } catch (error) {
        console.error("ERROR:", error);
        context.fail("Error processing request");
    }
};

// Respuesta al flujo de autorización de Alexa.
// Cuando Alexa solicita AcceptGrant, la Lambda debe responder con una
// confirmación vacía indicando que el grant fue aceptado.
async function handleAuthorization(request, context) {
    const payload = {};
    const header = { ...request.directive.header, name: "AcceptGrant.Response" };
    console.log("DEBUG", "AcceptGrant Response: ", JSON.stringify({ header, payload }));
    context.succeed({ event: { header, payload } });
}

// Manejo del descubrimiento de dispositivos.
// Esta función:
// 1) obtiene el usuario autenticado desde la solicitud,
// 2) consulta en BD los dispositivos asociados a ese usuario,
// 3) transforma esos dispositivos en endpoints compatibles con Alexa Discovery.
//
// IMPORTANTE: Alexa usa esta respuesta para mostrar los dispositivos en la app
// y para saber qué interfaces (PowerController, ToggleController, etc.) soporta cada uno.
async function handleDiscovery(request, context) {
      // =====================================
     // 1. OBTENER USUARIO
     // =====================================
    const userId = await Discovery(request);
    console.log('User ID desde handleDiscovery:', userId);
    
     // =====================================
     // 2. CONSULTAR API
     // =====================================
   // const devicesObt = await connectBD(userId);
    const devicesObt = await getDevices(userId);
    console.log('Lista de dispositivos con MACs', devicesObt);
    

    // =====================================
    // 3. VALIDAR RESPUESTA
    // =====================================

    // La API devuelve un array de dispositivos con campos como MAC, Nombre_difusion,
    // Nombre_personalizado y vigente. La transformación a endpoints Alexa se hace en
    // deviceMapper.js para separar la lógica de descubrimiento de la lógica de mapeo.
    const endpoints = buildAlexaEndpoints(devicesObt);
    const payload = { endpoints: endpoints };
    const header = { ...request.directive.header, name: "Discover.Response" };
    console.log("DEBUG", "Discovery Response: ", JSON.stringify({ header, payload }));
    context.succeed({ event: { header, payload } });
}
    // Estado en memoria del dispositivo.
    // Estas variables son globales al módulo y se usan como caché del estado actual.
    // Esto funciona para un único dispositivo, pero es frágil si el Lambda atiende
    // varios endpoints o varios usuarios en paralelo, porque el estado puede mezclarse.
    let powerState = "OFF"
    let toggleResultNigtMode = "OFF" 
    let toggleResultLockMode = "OFF"
    let toggleResultAhorroMode = "OFF"
    let toggleReset = "OFF"
    let toggleSilentBuzzer = "OFF"
    let toggleReleCerradura = "OFF"
    const deviceStates = {};

// Manejo de solicitudes TurnOn y TurnOff del PowerController.
// Se encarga de encender o apagar el dispositivo principal y responder a Alexa
// con el nuevo estado del powerState.
    async function handlePowerControl(request, context) {
    const requestMethod = request.directive.header.name;
    const endpointId = request.directive.endpoint.endpointId;
    
    console.log("Endpoint ID:", endpointId);
    //let powerState;
    
    try {

        // Conecta al broker MQTT del dispositivo indicado.
        await mqttClient.connectToMQTT(endpointId);
        console.log('MQTT Connected');
               // Publica un primer comando para inicializar la comunicación con el hardware.

        await mqttClient.publishMQTTCommand('5A405E', `eltecwifimedico/devices/${endpointId}/commands`, endpointId);
       

       // Se interpreta si Alexa pidió encender o apagar.
       // El método turnOnOff(endpointId) se usa para ambos casos, por lo que la lógica
       // del cambio real se delega al módulo mqttConnection.js.
        
        if (requestMethod === "TurnOn") {
            console.log("Turning On");
            await mqttClient.turnOnOff(endpointId);
            powerState = "ON";
        } else if (requestMethod === "TurnOff") {
            console.log("Turning Off");
            await mqttClient.turnOnOff(endpointId);
            powerState = "OFF";
        }

    } catch (error) {
        console.error('MQTT Connection Error:', error);
        context.fail("MQTT Connection Error");
        return;
    } finally {
        mqttClient.disconnectFromMQTT();
    }

    const response = {
        context: {
            properties: [
                {
                    namespace: "Alexa.PowerController",
                    name: "powerState",
                    value: powerState,
                    timeOfSample: new Date().toISOString(),
                    uncertaintyInMilliseconds: 500
                }
            ]
        },
        event: {
            header: {
                ...request.directive.header,
                namespace: "Alexa",
                name: "Response"
            },
            endpoint: {
                endpointId: endpointId
            },
            payload: {}
        }
    };

    console.log("DEBUG", "Alexa.PowerController Response: ", JSON.stringify(response));
    context.succeed(response);
}




// Manejo de requests tipo ToggleController.
// Alexa puede ofrecer varios toggles para un mismo dispositivo, cada uno con su instancia.
// Ejemplo: modo nocturno, bloqueo, ahorro, buzzer, relé, reset.
async function handleToggleControl(request, context) {
    const requestMethod = request.directive.header.name;
    const endpointId = request.directive.endpoint.endpointId;
    const instance = request.directive.header.instance;
    const responseHeader = {
        namespace: "Alexa",
        name: "Response",
        messageId: request.directive.header.messageId + "-R",
        correlationToken: request.directive.header.correlationToken,
        payloadVersion: "3"
    };
    console.log("ToggleController Request Method:", requestMethod);
    console.log("Endpoint ID:", endpointId);
    console.log("intancxe", instance);

    try {
        await mqttClient.connectToMQTT(endpointId);
        console.log('MQTT Connected toggle');

        // Publica el comando base para activar la comunicación con el dispositivo.
        await mqttClient.publishMQTTCommand('5A405E', `eltecwifimedico/devices/${endpointId}/commands`,endpointId );
        
        // Se evalúa qué instancia del ToggleController fue solicitada por Alexa.
        // Cada rama invoca una función específica del módulo MQTT para ejecutar el cambio.
        if (instance === "NightMode") {
            if (requestMethod === "TurnOn") {
                console.log("Activating Night Mode");
                await mqttClient.modoNocturno(endpointId, true);
                toggleResultNigtMode = "ON";
            } else if (requestMethod === "TurnOff") {
                console.log("Deactivating Night Mode");
                await mqttClient.modoNocturno(endpointId, false);
               toggleResultNigtMode = "OFF";
            }
        } else if (instance === "FridgeLockMode") {
            if (requestMethod === "TurnOn") {
                console.log("Activating Fridge Lock Mode");
                await mqttClient.bloqueoHealth(endpointId, true);
                toggleResultLockMode = "ON";
            } else if (requestMethod === "TurnOff") {
                console.log("Deactivating Fridge Lock Mode");
                await mqttClient.bloqueoHealth(endpointId, false);
                toggleResultLockMode = "OFF";
            }
        } else if(instance === "ModoAhorroTwo"){
            if (requestMethod === "TurnOn") {
                console.log("Activating Ahorro Mode");
                await mqttClient.modoAhorro2(endpointId, true);
                toggleResultAhorroMode = "ON";
            } else if (requestMethod === "TurnOff") {
                console.log("Deactivating ahorro Mode");
                await mqttClient.modoAhorro2(endpointId, false);
                toggleResultAhorroMode = "OFF";
            }

        } else if(instance === "Reset"){
            if (requestMethod === "TurnOn") {
                console.log("Activating Reset Mode");
                await mqttClient.estadoReset(endpointId, true);
                toggleReset = "ON";
            } else if (requestMethod === "TurnOff") {
                console.log("Deactivating reset Mode");
                await mqttClient.estadoReset(endpointId, false);
                toggleReset = "OFF";
            }

        } else if(instance === "ReleCerradura"){
            if (requestMethod === "TurnOn") {
                console.log("Activating rele cerradura Mode");
                await mqttClient.releCerradura(endpointId, true);
                toggleReleCerradura = "ON";
            } else if (requestMethod === "TurnOff") {
                console.log("Deactivating rele cerradura Mode");
                await mqttClient.releCerradura(endpointId, false);
                toggleReleCerradura = "OFF";
            }

        } else if(instance === "buzzerSilent"){
            if (requestMethod === "TurnOn") {
                console.log("Activating buzzer  Mode");
                await mqttClient.silencioBuzzer(endpointId, true);
                toggleSilentBuzzer = "ON";
            } else if (requestMethod === "TurnOff") {
                console.log("Deactivating buzzer Mode");
                await mqttClient.silencioBuzzer(endpointId, false);
                toggleSilentBuzzer = "OFF";
            }

        }

    } catch (error) {
        console.error('MQTT Connection Error:', error);
        context.fail("MQTT Connection Error");
        return;
    } finally {
        mqttClient.disconnectFromMQTT();
    }
    // Se construye el contexto con el estado de todas las capacidades toggle del dispositivo.
    // Alexa espera un array de propiedades donde cada una indica la instancia, el nombre y el valor.
    const contextResult = {
        "properties": [{
            "namespace": "Alexa.ToggleController",
            "instance":"NightMode",
            "name": "toggleState",
            "value": toggleResultNigtMode,
            "timeOfSample": new Date().toISOString(),
            "uncertaintyInMilliseconds": 500
        },
        {
            "namespace": "Alexa.ToggleController",
            "instance":"FridgeLockMode",
            "name": "toggleState",
            "value": toggleResultLockMode,
            "timeOfSample": new Date().toISOString(),
            "uncertaintyInMilliseconds": 500
        },
        {
            "namespace": "Alexa.ToggleController",
            "instance":"ModoAhorroTwo",
            "name": "toggleState",
            "value": toggleResultAhorroMode,
            "timeOfSample": new Date().toISOString(),
            "uncertaintyInMilliseconds": 500
        },
        {
            "namespace": "Alexa.ToggleController",
            "instance":"Reset",
            "name": "toggleState",
            "value": toggleReset,
            "timeOfSample": new Date().toISOString(),
            "uncertaintyInMilliseconds": 500
        },
        {
            "namespace": "Alexa.ToggleController",
            "instance":"buzzerSilent",
            "name": "toggleState",
            "value": toggleSilentBuzzer,
            "timeOfSample": new Date().toISOString(),
            "uncertaintyInMilliseconds": 500
        },
        {
            "namespace": "Alexa.ToggleController",
            "instance":"ReleCerradura",
            "name": "toggleState",
            "value": toggleReleCerradura,
            "timeOfSample": new Date().toISOString(),
            "uncertaintyInMilliseconds": 500
        }]
    };
    const response = {
        context: contextResult,
        event: {
            header: responseHeader,
            endpoint: {
                endpointId: endpointId
            },
            payload: {}
        }
    };

    console.log("DEBUG", "Alexa.ToggleController Response: ", JSON.stringify(response));
    context.succeed(response);
}

// Manejo de solicitudes ReportState.
// Alexa consulta este endpoint para saber el estado actual de las propiedades
// reportables del dispositivo: powerState y todos los toggleState definidos.
async function handleReportState(request, context) {
    let client;
    const endpointId = request.directive.endpoint.endpointId;
    const responseHeader = request.directive.header;
   console.log("este dispositivooooooooooooo", endpointId)
   
    // Se arma un estado consolidado con todas las propiedades que Alexa puede consultar.
    const contextResult = {
        "properties": [{
            "namespace": "Alexa.PowerController",
            "name": "powerState",
            "value":powerState,
            "timeOfSample": new Date().toISOString(), // Hora actual
            "uncertaintyInMilliseconds": 500
        
    },
    {
        "namespace": "Alexa.ToggleController",
        "instance":"NightMode",
        "name": "toggleState",
        "value": toggleResultNigtMode,
        "timeOfSample": new Date().toISOString(),
        "uncertaintyInMilliseconds": 500
    },
    {
        "namespace": "Alexa.ToggleController",
        "instance":"FridgeLockMode",
        "name": "toggleState",
        "value": toggleResultLockMode,
        "timeOfSample": new Date().toISOString(),
        "uncertaintyInMilliseconds": 500
    },
    {
        "namespace": "Alexa.ToggleController",
        "instance":"ModoAhorroTwo",
        "name": "toggleState",
        "value": toggleResultAhorroMode,
        "timeOfSample": new Date().toISOString(),
        "uncertaintyInMilliseconds": 500
    }, 
    {
        "namespace": "Alexa.ToggleController",
        "instance":"Reset",
        "name": "toggleState",
        "value": toggleReset,
        "timeOfSample": new Date().toISOString(),
        "uncertaintyInMilliseconds": 500
    },
    {
        "namespace": "Alexa.ToggleController",
        "instance":"buzzerSilent",
        "name": "toggleState",
        "value": toggleSilentBuzzer,
        "timeOfSample": new Date().toISOString(),
        "uncertaintyInMilliseconds": 500
    },
    {
        "namespace": "Alexa.ToggleController",
        "instance":"ReleCerradura",
        "name": "toggleState",
        "value": toggleReleCerradura,
        "timeOfSample": new Date().toISOString(),
        "uncertaintyInMilliseconds": 500
    }
]
};


    const response = {
        event: {
            header: {
                namespace: "Alexa",
                name: "StateReport",
                messageId: responseHeader.messageId + "-R",
                correlationToken: request.directive.header.correlationToken,
                payloadVersion: "3"
            },
            endpoint: {
                endpointId: endpointId
            },
            payload: {}
        },
        context: contextResult
    };

    context.succeed(response);


}
