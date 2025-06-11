# É PRECISO ATIVAR O SECURITY
# TAMBÉM É IMPORTANTE CRIAR UMA ROLE DE SUPER USER E USAR UM CURL PARA CRIAR UM NOVO USER


CRIAR PERMISSOES 


RESETAR SENHAS NO ES 
❯ docker exec -it elasticsearch_service bin/elasticsearch-reset-password -u elastic -i   
❯ docker exec -it elasticsearch_service bin/elasticsearch-reset-password -u kibana_system -i   


❯ curl -X POST "http://localhost:9200/_security/role/superuser-kibana" -H "Content-Type: application/json" -u elastic:12345678 -d'
{
  "cluster": ["all"],
  "indices": [
    {
      "names": ["*"],
      "privileges": ["all"]
    }
  ],
  "applications": [
    {
      "application": "*",
      "privileges": ["*"],
      "resources": ["*"]
    }
  ],
  "run_as": ["*"]
}


❯ curl -X POST "http://localhost:9200/_security/user/carlos" \
-H "Content-Type: application/json" \
-u elastic:12345678 \
-d '{
  "password": "12345678",
  "roles": ["superuser"],
  "full_name": "Carlos Superuser",
  "email": "carlos@example.com"
}'

