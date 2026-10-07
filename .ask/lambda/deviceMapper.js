// Convierte la respuesta de la API a una lista, ya que puede devolver un
// dispositivo único o varios dispositivos.
function normalizeDeviceList(devices) {
    let devicesArray = devices;
    if (!Array.isArray(devicesArray)) {
        if (devicesArray && typeof devicesArray === 'object') {
            devicesArray = [devicesArray];
        } else {
            throw new Error('Los dispositivos no están en el formato esperado (debe ser un array).');
        }
    }

    return devicesArray;
}

// Construye una capacidad ToggleController con los nombres que Alexa puede
// asociar por voz a una instancia concreta del modo.
function buildToggleCapability(instance, labels) {
    return {
        "type": "AlexaInterface",
        "interface": "Alexa.ToggleController",
        "version": "3",
        "instance": instance,
        "properties": {
            "supported": [{ "name": "toggleState" }],
            "retrievable": true
        },
        "capabilityResources": {
            "friendlyNames": labels.map(label => ({
                "@type": "text",
                "value": {
                    "text": label,
                    "locale": "es-MX"
                }
            }))
        }
    };
}

// Transforma los dispositivos activos de la API al formato de endpoints
// requerido por Alexa Discovery.
function buildAlexaEndpoints(devices) {
    const devicesArray = normalizeDeviceList(devices);

    return devicesArray
        .filter(device => {
            // Solo se anuncian dispositivos con MAC, nombre de difusión y estado vigente.
            if (!device || !device.MAC || !(device.Nombre_difusion || device.Nombre_difucion)) return false;
            const vigente = device.vigente === true || String(device.vigente).toLowerCase() === 'true';
            return vigente;
        })
        .map(device => {
            // La MAC normalizada funciona como identificador estable del endpoint en Alexa.
            const endpointId = device.MAC.replace(/:/g, '').toLowerCase();
            const broadcastName = device.Nombre_difusion || device.Nombre_difucion;
            const friendlyName = device.Nombre_personalizado || broadcastName || `Imbera-${endpointId}`;
            // Para refrigeradores se evita exponer SWITCH; OTHER es la categoría genérica.
            const displayCategory = device.tipo && device.tipo !== 'SWITCH' ? device.tipo : 'OTHER';

            return {
                "endpointId": endpointId,
                "manufacturerName": "Imbera",
                "modelName": endpointId,
                "friendlyName": friendlyName,
                "description": `${broadcastName} (${endpointId})`,
                "displayCategories": [displayCategory],
                "capabilities": [
                    // Control general de encendido/apagado del endpoint.
                    {
                        "interface": "Alexa.PowerController",
                        "version": "3",
                        "type": "AlexaInterface",
                        "properties": {
                            "supported": [{ "name": "powerState" }],
                            "retrievable": true
                        }
                    },
                    // Permite a Alexa consultar si el endpoint tiene conectividad.
                    {
                        "type": "AlexaInterface",
                        "interface": "Alexa.EndpointHealth",
                        "version": "3.2",
                        "properties": {
                            "supported": [{ "name": "connectivity" }],
                            "retrievable": true
                        }
                    },
                    // Modos del refrigerador: cada instancia tiene sus propios alias de voz.
                    buildToggleCapability("NightMode", [
                        "modo nocturno",
                        "nocturno",
                        "modo noche",
                        "noche"
                    ]),
                    buildToggleCapability("FridgeLockMode", [
                        "modo bloqueo",
                        "bloqueo",
                        "modo de bloqueo",
                        "bloquear",
                        "seguridad del refrigerador",
                        "modo seguro"
                    ]),
                    buildToggleCapability("ModoAhorroTwo", [
                        "modo ahorro",
                        "ahorro",
                        "modo eco",
                        "eco",
                        "ahorro energético"
                    ]),
                    buildToggleCapability("Reset", [
                        "modo reset",
                        "reset",
                        "reiniciar"
                    ]),
                    buildToggleCapability("buzzerSilent", [
                        "modo silencio",
                        "silencio",
                        "modo alerta",
                        "buzzer silencioso"
                    ]),
                    buildToggleCapability("ReleCerradura", [
                        "relé de cerradura",
                        "cerradura",
                        "modo cerradura",
                        "relé cerradura"
                    ]),
                    {
                        "type": "AlexaInterface",
                        "interface": "Alexa",
                        "version": "3"
                    }
                ]
            };
        });
}

module.exports = {
    buildAlexaEndpoints,
    normalizeDeviceList
};
