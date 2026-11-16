const SUPABASE_URL = 'https://ulhdwdbjpwmvxmsutolb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_S_QFJ8Tv9JZ4XN4EkC9fsA__7gyVHXK';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let esAdmin = false;
const WHATSAPP = '573012827684'; 

// ---------- Sesión del admin ----------
async function actualizarVista() {
    const { data } = await db.auth.getSession();
    esAdmin = !!data.session;

    const quiereEntrar = location.hash === '#admin';
    document.getElementById('login').hidden = esAdmin || !quiereEntrar;
    document.getElementById('panel').hidden = !esAdmin;
    cargarProductos();
}

document.getElementById('entrar').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) return alert('Error al entrar: ' + error.message);

    document.getElementById('password').value = '';
    actualizarVista();
});

document.getElementById('salir').addEventListener('click', async () => {
    await db.auth.signOut();
    actualizarVista();
});

// ---------- Comprimir imagen ----------
function comprimirImagen(archivo, anchoMax = 1200, calidad = 0.75) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const escala = Math.min(1, anchoMax / img.width);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * escala);
            canvas.height = Math.round(img.height * escala);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(img.src);
            canvas.toBlob(
                blob => blob ? resolve(blob) : reject(new Error('No se pudo comprimir')),
                'image/webp',
                calidad
            );
        };
        img.onerror = () => reject(new Error('No se pudo leer la imagen'));
        img.src = URL.createObjectURL(archivo);
    });
}

// ---------- Subir ----------
document.getElementById('subir').addEventListener('click', async () => {
    const original = document.getElementById('archivo').files[0];
    const descripcion = document.getElementById('descripcion').value;
    const precio = document.getElementById('precio').value;
    if (!original) return alert('elige una imagen');

    let archivo;
    try {
        archivo = await comprimirImagen(original);
    } catch (e) {
        return alert('Error al comprimir: ' + e.message);
    }
    console.log('Antes: ' + Math.round(original.size / 1024) + ' KB → Después: ' + Math.round(archivo.size / 1024) + ' KB');

    const nombre = Date.now() + '.webp';

    const { error: errorImagen } = await db.storage.from('productos').upload(nombre, archivo);
    if (errorImagen) return alert('Error al subir imagen: ' + errorImagen.message);

    const { error: errorTabla } = await db.from('catalogo').insert({
        imagen: nombre,
        descripcion,
        precio: precio === '' ? null : Number(precio)
    });
    if (errorTabla) return alert('Error al guardar descripción: ' + errorTabla.message);

    document.getElementById('archivo').value = '';
    document.getElementById('descripcion').value = '';
    document.getElementById('precio').value = '';
    cargarProductos();
});

// ---------- Editar descripción ----------
async function editarDescripcion(producto) {
    const nueva = prompt('Nueva descripción:', producto.descripcion || '');
    if (nueva === null) return;

    const { error } = await db
        .from('catalogo')
        .update({ descripcion: nueva })
        .eq('id', producto.id);
    if (error) return alert('Error al editar: ' + error.message);

    cargarProductos();
}

// ---------- Cambiar precio (con promoción) ----------
async function cambiarPrecio(producto) {
    const texto = prompt('Nuevo precio (solo números):', producto.precio ?? '');
    if (texto === null) return;

    const precio = texto.trim() === '' ? null : Number(texto);
    if (precio !== null && (isNaN(precio) || precio < 0)) return alert('Escribe un número válido');

    // Si el precio baja, guardamos el anterior para mostrarlo tachado
    let precio_anterior = null;
    if (precio !== null && producto.precio !== null && precio < producto.precio) {
        precio_anterior = producto.precio_anterior ?? producto.precio;
    }

    const { error } = await db
        .from('catalogo')
        .update({ precio, precio_anterior })
        .eq('id', producto.id);
    if (error) return alert('Error al cambiar precio: ' + error.message);

    cargarProductos();
}

// ---------- Disponible / No disponible ----------
async function cambiarDisponible(producto) {
    const { error } = await db
        .from('catalogo')
        .update({ disponible: !producto.disponible })
        .eq('id', producto.id);
    if (error) return alert('Error: ' + error.message);

    cargarProductos();
}

// ---------- Eliminar ----------
async function eliminarProducto(producto) {
    if (!confirm('¿Seguro que quieres eliminarlo?')) return;

    const { error: errorImagen } = await db.storage.from('productos').remove([producto.imagen]);
    if (errorImagen) return alert('Error al borrar imagen: ' + errorImagen.message);

    const { error: errorTabla } = await db.from('catalogo').delete().eq('id', producto.id);
    if (errorTabla) return alert('Error al borrar fila: ' + errorTabla.message);

    cargarProductos();
}

// ---------- Mostrar el catálogo ----------
const formato = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

// ---------- Visor de imagen ampliada ----------
const visor = document.getElementById('visor');
const visorImg = document.getElementById('visor-img');

function abrirVisor(url) {
    visorImg.src = url;
    visor.hidden = false;
}

function cerrarVisor() {
    visor.hidden = true;
    visorImg.src = '';
}

visor.addEventListener('click', cerrarVisor);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarVisor();
});

async function cargarProductos() {
    const { data, error } = await db.from('catalogo').select('*').order('id', { ascending: false });
    if (error) return alert('Error: ' + error.message);

    const lista = document.getElementById('lista');
    lista.innerHTML = '';

    data.forEach(producto => {
        const { data: urlData } = db.storage.from('productos').getPublicUrl(producto.imagen);

        const div = document.createElement('div');
        if (!producto.disponible) div.classList.add('agotado');

        const foto = document.createElement('div');
        foto.className = 'foto';

        const img = document.createElement('img');
        img.src = urlData.publicUrl;
        foto.appendChild(img);

        img.alt = producto.descripcion || 'Producto';
        img.addEventListener('click', () => abrirVisor(urlData.publicUrl));

        if (!producto.disponible) {
            const etiqueta = document.createElement('span');
            etiqueta.className = 'etiqueta';
            etiqueta.textContent = 'No disponible';
            foto.appendChild(etiqueta);
        }

        const texto = document.createElement('p');
        texto.className = 'descripcion';
        texto.textContent = producto.descripcion;

        const precio = document.createElement('p');
        precio.className = 'precio';
        if (producto.precio !== null) {
            if (producto.precio_anterior) {
                const viejo = document.createElement('s');
                viejo.textContent = formato.format(Number(producto.precio_anterior));
                precio.append(viejo, ' ');
            }
            precio.append(formato.format(Number(producto.precio)));
        } else {
            precio.textContent = 'Consultar precio';
        }

        div.append(foto, texto, precio);
        // NUEVO: botón de WhatsApp (solo si el producto está disponible)
if (producto.disponible) {
    const textoPrecio = producto.precio !== null
        ? formato.format(Number(producto.precio))
        : 'por consultar';

    const mensaje =
        'Hola, me interesa este producto:\n' +
        producto.descripcion + '\n' +
        'Precio: ' + textoPrecio + '\n' +
        urlData.publicUrl;

    const enlace = document.createElement('a');
    enlace.className = 'btn-whatsapp';
    enlace.textContent = 'Pedir por WhatsApp';
    enlace.href = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(mensaje);
    enlace.target = '_blank';
    enlace.rel = 'noopener';
    div.appendChild(enlace);
}




        if (esAdmin) {
            const acciones = document.createElement('div');
            acciones.className = 'acciones';

            const botonEditar = document.createElement('button');
            botonEditar.textContent = 'Descripción';
            botonEditar.addEventListener('click', () => editarDescripcion(producto));

            const botonPrecio = document.createElement('button');
            botonPrecio.textContent = 'Precio';
            botonPrecio.addEventListener('click', () => cambiarPrecio(producto));

            const botonDisponible = document.createElement('button');
            botonDisponible.textContent = producto.disponible ? 'Marcar agotado' : 'Marcar disponible';
            botonDisponible.addEventListener('click', () => cambiarDisponible(producto));

            const botonEliminar = document.createElement('button');
            botonEliminar.className = 'btn-eliminar';
            botonEliminar.textContent = 'Eliminar';
            botonEliminar.addEventListener('click', () => eliminarProducto(producto));

            acciones.append(botonEditar, botonPrecio, botonDisponible, botonEliminar);
            div.appendChild(acciones);
        }

        lista.appendChild(div);
    });
}

// ---------- Arranque ----------
window.addEventListener('hashchange', actualizarVista);
actualizarVista();