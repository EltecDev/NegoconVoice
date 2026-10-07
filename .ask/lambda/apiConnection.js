
async function getDevices(userId) {
//https://electronicaeltec.com:4443/Api/AlexaUsers/{usuario}/MacUsuarioAlexa
// 
  
 console.log( "Usuario:", userId );

   // const url = `https://mi-api.com/api/devices/${userId}`;
   const url = `https://electronicaeltec.com:4443/Api/AlexaUsers/${userId}/MacUsuarioAlexa`;

    console.log("Consultando API:", url);

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(
            `Error al consultar API. Status: ${response.status}`
        );
    }

    const devices = await response.json();

    console.log(
        "Dispositivos obtenidos:",
        JSON.stringify(devices)
    );

    return devices;
}

module.exports = {
    getDevices
};