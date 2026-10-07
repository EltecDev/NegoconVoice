const mysql = require('mysql2/promise');

async function connectBD(userId) {
    try {
        const connection = await mysql.createConnection({
            host: 'electronicaeltec.com',
            port: 3306,
            user: 'moises',
            password: '9873216543',
            database: 'BD_Imbera',
            waitForConnections: true,
           connectionLimit: 10,
           queueLimit: 0,
           enableKeepAlive: true,
           keepAliveInitialDelay: 10000,
           ssl: false //  Deshabilitar SSL
        });

        console.log('Conectado a la base de datos');

        // Ejecutar procedimiento almacenado con el parámetro 
        const user = userId;
         console.log('Buscando en la base de usuario con userId:', user);
        const [results] = await connection.execute('CALL mac_usuario_alexa(?)', [user]);
        // Verificar si results[0] es un array
        if (Array.isArray(results[0])) {
            console.log('Dispositivos encontrados:', results);
            // Mapear los dispositivos del primer array
        const devices = results[0].map(device => {
            
           
            if (!device.MAC || !device.Nombre_difucion || device.vigente !== 1) {
                console.error('Dispositivo con datos incompletos:', device);
                return null; // decidir omitir el dispositivo si tiene datos incompletos
            }
          
            return {
                id: device.MAC.replace(/:/g, '').toLowerCase(),
               // friendlyName:`IMBERA-${device.MAC.replace(/:/g, '').toLowerCase()}`,
                friendlyName: device.Nombre_personalizado,
                Nombre_difucion: device.Nombre_difucion,
                tipo: 'OTHER'

            };
        }).filter(device => device !== null); // Elimina dispositivos con datos incompletos

        return devices;

        } else {
            console.error('No se encontró un array en los resultados');
            return [];
        }
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}
module.exports = { connectBD };
 
