package doctor

import "testing"

func TestDiagnoseJSONPreservesSecretAsRequiredInputOnly(t *testing.T) {
	response, err := DiagnoseJSON([]byte(`{"manifests":[{"ID":"plugin","Requirements":[{"ID":"plugin.token","Path":"/plugin/token","Secret":true,"Required":true,"Hint":"set token"}]}],"configured":{}}`))
	if err != nil || response.OK || len(response.Repair.SafeDefaults) != 0 || len(response.Repair.RequiredInput) != 1 {
		t.Fatalf("response/error = %#v / %v", response, err)
	}
}
