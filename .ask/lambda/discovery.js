const https = require('https');
const crypto = require('crypto');

// Función Discovery para obtener y devolver el userId en formato MD5
async function Discovery(request) {
    const accessToken = request?.directive?.payload?.scope?.token;
    if (!accessToken) {
        throw new Error('No se recibió un access token');
    }

    try {
        // Obtener el perfil del usuario
        const userProfile = await getUserProfile(accessToken);
        const userId = userProfile.user_id;
        if (!userId) {
            throw new Error('Amazon no devolvió user_id');
        }
        
        // Generar el hash MD5 del userId
        const hashedUserId = generateMD5(userId);
        return hashedUserId;

    } catch (error) {
        console.error("Error en Discovery:", error);
        throw new Error("No se pudo obtener el perfil del usuario");
    }
}

// Función asincrónica para obtener el perfil del usuario desde la API de Amazon
async function getUserProfile(accessToken) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.amazon.com',
            path: '/user/profile',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', chunk => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`Perfil de Amazon respondió HTTP ${res.statusCode}`));
                    return;
                }

                try {
                    const userProfile = JSON.parse(data);
                    resolve(userProfile);
                } catch (error) {
                    reject(new Error('Error al parsear los datos del perfil'));
                }
            });
        });

        req.on('error', (e) => {
            reject(new Error(`Error en la solicitud HTTP: ${e.message}`));
        });

        req.setTimeout(5000, () => {
            req.destroy(new Error('Tiempo de espera agotado al consultar Amazon'));
        });
        req.end();
    });
}

// Función para generar el hash MD5 de un string
function generateMD5(inputString) {
    return crypto.createHash('md5').update(inputString).digest('hex');
}

module.exports = { Discovery };
