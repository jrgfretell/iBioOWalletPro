// Un saldo conciliado incluye el pasado y los movimientos existentes al registrarlo.
function movimientoPosteriorReferencia(mov, referencia, incluidos) {
    if (!referencia) return true;
    if (mov.fecha < referencia) return false;
    return mov.fecha > referencia || !incluidos.has(String(mov.id));
}
function sueldoPosteriorReferencia(anio, mes, dia, referencia) {
    const fecha = `${anio}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
    return !referencia || fecha > referencia;
}
function importeHito(monto, anio, mes, dia, referencia) {
    return sueldoPosteriorReferencia(anio,mes,dia,referencia)
        ? `S/. ${monto.toFixed(2)}` : 'Incluido en saldo de referencia';
}
