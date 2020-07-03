#!/bin/bash

[ "$1" = "light" ] && light=1 || light=''

GREEN='\033[1;32m'
BLUE='\e[1;34m'
ORANGE='\e[1;33m'
RED='\033[1;31m'
NC='\033[0m'

systemctl status docker 1>& 2> /dev/null || sudo systemctl start docker

docker network create elastic-network 2> /dev/null

[ "`docker ps -qaf 'name=elastic'`" ] && docker rm -f elastic
[ "`docker ps -qaf 'name=kibana'`" ]  && docker rm -f kibana


if [ ! "$light" ]; then
       echo "Setting up system configuration..."
       # https://www.elastic.co/guide/en/elasticsearch/reference/current/vm-max-map-count.html
       sudo sysctl -w vm.max_map_count=262144

       # https://www.elastic.co/guide/en/elasticsearch/reference/current/max-number-of-threads.html
       sudo ulimit -u 4096
fi

docker run \
       -d \
       -m 2048m \
       --name elastic \
       --net elastic-network \
       -p 9200:9200 -p 9300:9300 \
       -e "discovery.type=single-node" \
       elasticsearch:7.6.2
       # -e "index.number_of_shards=5" \
       # -e "index.number_of_replicas=1" \
       # -e "ES_JAVA_OPTS=\"-Xms3g -Xmx3g\"" \

if [ ! "$light" ]; then
       docker run \
              -d \
              --memory-reservation="256m" \
              --name kibana \
              --net elastic-network \
              -p 5601:5601 \
              -e "ELASTICSEARCH_HOSTS=http://elastic:9200" \
              kibana:7.6.2
fi

if [ -f ./bulk.json ]; then
       res=''
       echo -n "Waiting for ElasticSearch to be ready..."
       while [ ! "$res" ]; do
              res=`curl -Ssl http://localhost:9200/ 2> /dev/null | grep "for Search"`
              echo -n '.'
              sleep 1
       done
       echo

       curl -s -XPOST http://localhost:9200/_bulk --data-binary @bulk.json -H "Content-Type: application/json" @bulk.json
else
       printf "${RED}Couldn't find bulk file${NC}, didn't add any documents to ES.";
fi

echo -e "`cat << EOF


    ${GREEN}All Done!${NC}

    You can now access ${ORANGE}kibana${NC} on http://localhost:5601 ( it might take up to 1min to be ready... )
    And ${BLUE}ElasticSearch${NC} on http://localhost:9200
EOF
`"


if [ ! "$light" ]; then
       echo -ne "\n\nConfiguring ES Ressources..."
       status=1
       while [ "$status" -ne 0 ]; do
              sleep 2

              curl -XPOST 'http://localhost:9200/_template/default' \
                     -H 'Content-Type:application/json' \
                     -d '{
                            "index_patterns": ["*"],
                            "order": -1,
                            "settings": {
                                   "number_of_shards": 5,
                                   "number_of_replicas": 1
                            }
                     }' 2> /dev/null

              status=$?

              echo -n '.'
       done

       echo
       echo
fi
