async function readJsonBody(req,limit){
 let text='';
 if(req.body!==undefined){text=Buffer.isBuffer(req.body)?req.body.toString('utf8'):typeof req.body==='string'?req.body:JSON.stringify(req.body)}
 else for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>limit)throw Object.assign(Error('Solicitud demasiado grande.'),{status:413})}
 if(Buffer.byteLength(text||'')>limit)throw Object.assign(Error('Solicitud demasiado grande.'),{status:413});
 try{return JSON.parse(text)}catch{throw Object.assign(Error('Solicitud JSON inválida.'),{status:400})}
}
module.exports={readJsonBody};
