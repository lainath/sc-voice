<template>
  <v-sheet style="border-top:3px solid #eee" light>
    <v-container fluid grid-list-md >
      <div class="stats">
        <v-progress-circular :value="diskPercent"
          v-if="identity"
          :title="$vuetify.lang.t('$vuetify.auth.diskUsage')"
          size="35" width="6" rotate="90"
          color="red">
          <div style="font-size:12px; line-height:1.1 !important"
            v-if="identity">
          {{diskPercent}}%
          </div>
        </v-progress-circular>
        <div v-if="identity" class="ml-3">
            <b>{{ $vuetify.lang.t('$vuetify.auth.cacheUsed') }}</b>
            {{cacheUsed}}GB
            <br/> 
            <b>{{ $vuetify.lang.t('$vuetify.auth.diskUsed') }}</b>
            {{diskUsed}}GB
            <br/> 
            <b>{{ $vuetify.lang.t('$vuetify.auth.diskAvailable') }}</b>
            {{(identity.diskavail/1E9).toFixed(1)}}GB
        </div>
        <div v-if="identity == null">
            {{ $vuetify.lang.t('$vuetify.auth.loading') }}
        </div>
      </div>

      <div class="cache-table">
        <v-data-table
          v-model="selected"
          :headers="cacheHeaders"
          :items="caches"
          class="elevation-1 "
          dense
          style="max-width:40em"
          item-key="name"
          :show-select="true"
          :single-select="false"
          >
          <template v-slot:item.size="{ item }">
            {{(item.size/1E6).toFixed(1)}}MB
          </template>
          <template v-slot:no-data>
            {{ $vuetify.lang.t('$vuetify.auth.loading') }}
          </template>
        </v-data-table>
        <v-btn :disabled="selected.length===0"
          small
          class="mt-2 orange darken-2" dark
          @click="onClearCaches">
          {{ $vuetify.lang.t('$vuetify.auth.clearCache') }}
        </v-btn>
      </div>

    </v-container>
  </v-sheet>
</template>

<script>
/* eslint no-console: 0*/
import Vue from "vue";

export default {
    name: 'Caches',
    props: {
    },
    data: () => {
        return {
            user:{},
            selected: [],
            caches: [],
            cleared: {},
            identity: null,
            isWaiting: false,
        }
    },
    methods: {
        getIdentity() {
            var urlVol = this.url("identity");
            this.$http.get(urlVol).then(res => {
                var identity = res.data;
                this.identity = identity;
                console.log(res.data);
            }).catch(e => {
                console.error(`getIdentity() failed`, e.stack);
            });
        },
        getCaches() {
            var urlVol = this.url("auth/sound-store/volume-info"); 
            var {
                cleared,
            } = this;
            this.$http.get(urlVol, this.authConfig).then(res => {
                var cacheNames = Object.keys(res.data);
                this.caches = cacheNames.map(name => {
                    var cache = res.data[name];
                    cache.cleared = cleared[cache.name] 
                        ? this.$vuetify.lang.t("$vuetify.auth.cleared")
                        :'';
                    return cache;
                });
                console.log(res.data);
            }).catch(e => {
                console.error(`getCaches() failed`, e.stack);
            });
        },
        onClearCaches() {
            this.selected.forEach(cache => {
                this.clearCache(cache);
            });
        },
        clearCache(cache) {
            var volume = cache.name;
            console.log('clearCache', volume);
            var urlVol = this.url("auth/sound-store/clear-volume"); 
            var data = {
                volume,
            }
            var that = this;
            this.$http.post(urlVol, data, this.authConfig).then(res => {
                console.log(`cleared cache:${volume}`,res.data);
                that.getCaches();
                Vue.set(that.cleared, volume, 'cleared');
            }).catch(e => {
                console.error(`onClearCache() failed`, e.stack);
            });
        },
        url(path) {
            return window.location.origin === 'http://localhost:8080'
                ? `http://localhost/scv/${path}`
                : `./${path}`;
        },
        dateString(date) {
            return date && date.toLocaleString() || this.na;
        },
    },
    mounted() {
        this.user = this.gscv.user;
        setTimeout(() => {
            this.getCaches();
            this.getIdentity();
        }, 1000);
    },
    computed: {
        cacheHeaders() {
            return [{
                text: this.$vuetify.lang.t("$vuetify.auth.cacheName"),
                align: 'left',
                value: 'name'
            },{
                text: this.$vuetify.lang.t("$vuetify.auth.cacheSize"),
                align: 'right',
                value: 'size',
            },{
                text: this.$vuetify.lang.t("$vuetify.auth.cacheCleared"),
                align: 'right',
                value: 'cleared',
            }];
        },
        cacheName() {
            return this.$vuetify.lang.t("$vuetif.auth.cacheName");
        },
        cacheSize() {
            return this.$vuetify.lang.t("$vuetif.auth.cacheSize");
        },
        cacheCleared() {
            return this.$vuetify.lang.t("$vuetif.auth.cacheCleared");
        },
        gscv() {
            return this.$root.$data;
        },
        cacheUsed() {
            var used = this.caches.reduce((acc, c) => {
                return acc + c.size;
            }, 0);
            return (used/1E9).toFixed(1);
        },
        diskUsed() {
            if (!this.identity) {
                return '--';
            }
            var {
                diskavail,
                disktotal,
            } = this.identity;
            return ((disktotal - diskavail)/1E9).toFixed(1);
        },
        diskPercent() {
            if (!this.identity) {
                return '--';
            }
            var {
                diskavail,
                disktotal,
            } = this.identity;
            var diskused = disktotal - diskavail;
            return (diskused / disktotal * 100).toFixed(0);
        },
        token() {
            return this.user && this.user.token;
        },
        na() {
            return "--";
        },
        authConfig() {
            return {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                }
            }
        },
    },
    components: {
    },
}
</script>

<style scoped>
.stats {
    display: flex;
    flex-flow: row wrap;
    justify-content: center;
    align-items: center;
    margin-bottom: 0.5em;
}
.cache-table {
    display: flex;
    flex-flow: column;
    align-items: center;
    justify-content: center;
}
th {
    text-align: left;
}
</style>
