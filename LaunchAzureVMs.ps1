$subscr="BDHadoopTeamPMTestDemo"
$staccount="portalvhds6z8xxq2ssy3td"
Select-AzureSubscription -SubscriptionName $subscr -Current
Set-AzureSubscription -SubscriptionName $subscr -CurrentStorageAccountName $staccount

$servicename = "amitkul-WASBenchmark"
$location = "Southeast Asia"
New-AzureService -ServiceName $servicename -Location $location -Label $servicename

#$vmsize = "Large"
#$imagename = "WASStress-4MBx8-V2"
$vmsize = "A9"
$imagename = "WASStress-1KBx100"
$un = "arkulkarni"
$pwd = "Shasta9075"
$vms = @()
for($i=1; $i -le 1; $i++)
{
	$vmname = "amit-WASS" + $i
	$vmconfig = New-AzureVMConfig -Name $vmname -InstanceSize $vmsize -ImageName $imagename
	$vmconfig | Add-AzureProvisioningConfig -Linux -LinuxUser $un -Password $pwd
	
	$vms += $vmconfig
}

New-AzureVM -ServiceName $servicename -VMs $vms
