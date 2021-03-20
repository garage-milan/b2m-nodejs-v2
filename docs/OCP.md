## How to monitor applications on OpenShift 4.x with Prometheus Operator
OpenShift Container Platform includes a pre-configured, pre-installed, and self-updating monitoring stack that is based on the Prometheus open source project and its wider eco-system. It provides monitoring of cluster components and includes a set of alerts to immediately notify the cluster administrator about any occurring problems and a set of Grafana dashboards. The cluster monitoring stack is only supported for monitoring OpenShift Container Platform clusters and adding additional monitoring targets is not supported.

In this lab we will configure application monitoring stack on Openshift 4.x using Prometheus Operator for a sample Node.js microservice instrumented with Prometheus client library (instrumentation was covered in Lab-3).

### Deploy an instrumented application
Use the following command and provided yaml file, to deploy sample Node.js microservice instrumented with Prometheus client library. 

```sh
oc new-project b2m-nodejs
oc create -f b2m-nodejs.yml
```
In case of [problems with pulling the app image from Docker Hub](https://www.openshift.com/blog/mitigate-impact-of-docker-hub-pull-request-limits), you can build the application image by yourself using:
```sh
oc new-app https://github.com/garage-milan/b2m-nodejs-v2 \
--context-dir=lab-4/app --name b2m-nodejs \
--labels='name=b2m-nodejs' --insecure-registry=true
```

The monitor expects the service's port name to be `web`, so edit the service and change  `spec.ports.name` to `web`:

```yaml
  spec:
    clusterIP: xxx.xxx.xxx.xxx
    ports:
      - name: web
```
Create route to expose this application externally:

```sh
oc expose svc b2m-nodejs
```
Collect the app URL:

```sh
$ oc get routes -n default
NAME         HOST/PORT                                       PATH   SERVICES     PORT    TERMINATION   WILDCARD
b2m-nodejs   b2m-nodejs-b2m-nodejs.apps.rsocp.os.fyre.ibm.com          b2m-nodejs   <all>   edge          None
```
and make sure it works:

```sh
$ curl -k https://b2m-nodejs-b2m-nodejs.apps.rsocp.os.fyre.ibm.com

{"status":"ok","transactionTime":"353ms"}
```

Verify that it properly exposes metrics in Prometheus format:

```sh
$ curl -k https://b2m-nodejs-b2m-nodejs.apps.rsocp.os.fyre.ibm.com/metrics

# HELP process_cpu_user_seconds_total Total user CPU time spent in seconds.
# TYPE process_cpu_user_seconds_total counter
process_cpu_user_seconds_total 0.23436700000000005 1573764470969

# HELP process_cpu_system_seconds_total Total system CPU time spent in seconds.
# TYPE process_cpu_system_seconds_total counter
process_cpu_system_seconds_total 0.069524 1573764470969

# HELP process_cpu_seconds_total Total user and system CPU time spent in seconds.
# TYPE process_cpu_seconds_total counter
process_cpu_seconds_total 0.3038910000000002 1573764470969
(...)
```

### Deploy Prometheus monitoring stack for applications.

1). Create a new project for the Prometheus monitoring stack for applications.

![](images/2019-11-13-13-28-53.png)

2). Select Operators -> Operator Hub and select `Prometheus Operator`. Click `Install`.

![](images/2019-11-13-13-27-51.png)

3). In the `Create Operator Subscription` window click `Subscribe`.
   
![](images/2019-11-13-13-44-07.png)

4). Wait until Prometheus Operator is deployed and click `Prometheus Operator` link.
 
![](images/2019-11-13-13-44-44.png)

5). Select `Prometheus` tab and click `Create Prometheus` button.

![](images/2019-11-13-13-45-19.png)

6). Modify default YAML template for Prometheus. I added `serviceMonitorSelector` definition which will instruct defined Prometheus instance to match `ServiceMonitors` with label `key=btm-metrics`. I also changed the Prometheus instance name to `app-monitor`.
   
```yaml
apiVersion: monitoring.coreos.com/v1
kind: Prometheus
metadata:
    name: app-monitor
  labels:
    prometheus: k8s
  namespace: monitoring
spec:
  replicas: 1
  serviceAccountName: prometheus-k8s
  securityContext: {}
  serviceMonitorSelector:
    matchExpressions:
      - key: btm-metrics
        operator: Exists
  ruleSelector:
    matchLabels:
      prometheus: app-monitor
      role: alert-rules
  alerting:
    alertmanagers: {}
```

Click `Create` button.

![](images/2019-11-14-22-05-51.png)

7). Select `Service Monitor` tab and click `Create Service Monitor`.

![](images/2019-11-13-13-46-31.png)

8). Modify default YAML template for ServiceMonitor. I added `namespaceSelector` definition to limit the scope to naespace `default` where my app has been deployed and modified `selector` that to look for services with label `name=b2m-nodejs`. I also changed the Service monitor name to `app-monitor`.


```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  labels:
    btm-metrics: b2m-nodejs
  name: app-monitor
  namespace: monitoring
spec:
  endpoints:
    - interval: 30s
      port: web
  namespaceSelector:
    matchNames:
      - b2m-nodejs
  selector:
    matchLabels:
      name: b2m-nodejs
```

![](images/2019-11-13-13-49-32.png)

9). Grant `view` cluster role to the Service Account created by the operator and used by Prometheus.

```sh
oc adm policy add-cluster-role-to-user view system:serviceaccount:monitoring:prometheus-k8s
```

or, if you want to limit it to the application namespace, add `view` role only to the app namespace:

```sh
oc adm policy add-role-to-user view system:serviceaccount:monitoring:prometheus-k8s -n default
```


10). Expose app monitoring Prometheus route:

```sh
oc expose svc/prometheus-operated -n monitoring
```

11). Collect the app monitoring Prometheus URL:

```sh
$ oc get routes -n monitoring
NAME                  HOST/PORT                                                   PATH   SERVICES              PORT   TERMINATION   WILDCARD
prometheus-operated   prometheus-operated-monitoring.apps.rsocp.os.fyre.ibm.com          prometheus-operated   web                  None
```

12). Verify that app monitoring Prometheus can scrape `b2m-nodejs` app. Access the Prometheus URL via browser and select Status -> Targets.

![](images/2019-11-14-22-48-30.png)

13). Verify that instrumented metrics are collected:
    
![](images/2019-11-14-22-51-10.png)

### Deploy the Grafana Operator
1). Deploy the Grafana Operator from OperatorHub using the same steps as for Prometheus Operator.
Now you should see it in `Operators -> Installed Operators`.

![](images/2019-11-19-13-54-49.png)

2). Click on the Grafana Operator link, select `Grafana` tab and click `Create Grafana`.

![](images/2019-11-19-13-58-23.png)

3). Modify the name of the Grafana instance to something meaningful. I named it `app-monitoring-grafana`. Click `Create` button. Modify also the admin user name and password.

4). Return to the Grafana Operator details, select `Grafana Data Source` and click `Create Grafana Data Source` button. Rename the `name:` to something meaningful (I named it `app-monitoring-grafana-datasource`) and modify spec.datasources.url to your app monitoring prometheus instance. In my case it was `http://prometheus-operated:9090`. 

![](images/2019-11-19-14-12-59.png)

The prometheus hostname is the same as the app monitoring prometheus service name. You can find it in `Networking->Services` (filtered by the project where app monitoring prometheus has been deployed).

5). Make the route for Grafana has been created in `Networking->Routes` (project `monitoring`). If it is not listed, create it with command:

```sh
oc create route edge  --service=grafana-service -n monitoring
```
Access the Grafana console URL and logon to Grafana.
Verify the Prometheus datasource has been created and can connect to app monitoring Prometheus.

6). Import provided grafana dashboard: `b2m-nodejs-v2/lab-4/app-monitoring-dashboard.json`.

7). Verify that Grafana dashboard has been provisioned:

![](images/2019-11-19-15-02-49.png)

### Deploy Alertmanager

The Prometheus Operator introduces an `Alertmanager` resource, which allows users to declaratively describe an Alertmanager cluster. To successfully deploy an Alertmanager cluster, it is important to understand the contract between Prometheus and Alertmanager.

The Alertmanager may be used to:

- Deduplicate alerts fired by Prometheus
- Silence alerts
- Route and send grouped notifications via providers (PagerDuty, OpsGenie, Slack, Netcool Message Bus Probe, etc.)

Prometheus' configuration also includes "rule files", which contain the alerting rules. When an alerting rule triggers, it fires that alert against all Alertmanager instances, on every rule evaluation interval. The Alertmanager instances communicate to each other which notifications have already been sent out.

In OpenShift console go to Installed Operators, click on Prometheus Operator instance, scroll tabs to Alertmanager tab.
Click `Create Alertmanager` button.

![](images/2019-11-20-11-46-42.png)

Specify the desired number of replicas and click `Create` button.

![](images/2019-11-20-11-47-47.png)

Now you can list the resources of Alertmanager and you should see Alertmanager pods in `Pending` state. This is because Alertmanager can't run wthout a configuration file.

The Alertmanager instances will not be able to start up, unless a valid configuration is given. The following example configuration sends notifications against a non-existent webhook, allowing the Alertmanager to start up, without issuing any notifications. For more information on configuring Alertmanager, see the [Prometheus Alerting Configuration](https://prometheus.io/docs/alerting/configuration/) document.
```yaml
global:
  resolve_timeout: 5m
route:
  group_by: ['job']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 12h
  receiver: 'webhook'
receivers:
- name: 'webhook'
  webhook_configs:
  - url: 'http://alertmanagerwh:30500/'
```

Save the above Alertmanager config in a file called alertmanager.yaml and create a secret from it using `oc`.

```sh
oc create secret generic alertmanager-alertmanager-main --from-file=alertmanager.yaml
```

Alertmanager pods should change the status to `Running`.

![](images/2019-11-20-12-03-25.png)

The service `alertmanager-operated` has been created automatically and if you want to externally expose Alertmanaget UI, create the route using the followng command:

```sh
$ oc create route edge  --service=alertmanager-operated -n monitoring
```

Collect the Alertmanager URL:

```sh
 oc get routes alertmanager-operated
NAME                    HOST/PORT                                                     PATH   SERVICES                PORT   TERMINATION   WILDCARD
alertmanager-operated   alertmanager-operated-monitoring.apps.rsocp.os.fyre.ibm.com          alertmanager-operated   web    edge          None
```

and verify using web browser:

![](images/2019-11-20-12-07-34.png)


This Alertmanager cluster is now fully functional and highly available, but no alerts are fired against it. Configure Prometheus resource to fire alerts to our Alertmanager cluster.

Edit Prometheus resource `spec.alerting` section:

```yaml
spec:
  alerting:
    alertmanagers:
      - name: alertmanager-operated
        namespace: monitoring
        port: web
```
and click `Save`.

### Configure Alerting Rules

Alerting Rules for application monitoring can be created from the `Operator Details` view of our Prometheus Operator instance. Click on the `Prometheus Rule` tab and then on `Create Prometheus Rule` button.

![](images/2019-11-20-13-46-22.png)

Specify alert rule definition in the YAML file. You can use provided ExampleAlert.yaml as an example.
![](images/2020-08-17-10-41-38.png)


After short time verify that your alert(s) have been activated using  Prometheus UI:

![](/images/2019-11-21-15-53-47.png)