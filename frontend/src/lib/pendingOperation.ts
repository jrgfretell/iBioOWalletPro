interface StorageOperaciones {getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void;removeItem:(key:string)=>void}

/** Store only an opaque request ID and a hash, never the financial payload. */
export async function prepararOperacion(storage:StorageOperaciones|null,userId:string,walletId:number,accion:string,datos:Record<string,unknown>,solicitud:string) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({accion,datos})));
  const hash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  const key=`wallet_operacion_pendiente:${userId}:${walletId}:${hash}`;
  try {const previa=storage?.getItem(key);if(previa)solicitud=previa;else storage?.setItem(key,solicitud);}catch{/* An open form still retains its request ID when storage is unavailable. */}
  return {solicitud,confirmar:()=>{try{storage?.removeItem(key);}catch{/* Optional storage. */}}};
}
