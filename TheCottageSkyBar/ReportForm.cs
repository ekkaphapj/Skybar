using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Data.OleDb;

namespace TheCottageSkyBar
{
    public partial class ReportForm : Form
    {
        public ReportForm()
        {
            InitializeComponent();
        }

        bool loadVoucher = false;
        private void button3_Click(object sender, EventArgs e)
        {
            this.Close();
        }

        private void button1_Click(object sender, EventArgs e)
        {
           
            if (validator())
            {
                LoadVoucher();
                getFullReport();
            }
            else
            {
                reset();
            }
        }


        private void getFullReport()
        {
            loadStockRemaining();
            loadSellfromDate();
            loadCostfromDate();
            LoadCashTransaction();
            sumAccount();
            textBox3.Text = Form1.getTotalCash(getDateTime(dateTimePicker2.Value.ToShortDateString())).ToString();
            loadCashAndTransferfromDate();
            getCashAndTransferSell();
            LoadVoucherAmount();
        }

        private bool validator()
        {
            DateTime d1 = Convert.ToDateTime(dateTimePicker1.Value.ToShortDateString());
            DateTime d2 = Convert.ToDateTime(dateTimePicker2.Value.ToShortDateString());
            int _i = DateTime.Compare(d1,d2);
            if (_i>0)
            {
                MessageBox.Show("เลือกวันที่ไม่ถูกต้อง");
                return false;
            }
            return true;
        }

        private void reset()
        {
            dateTimePicker1.Value = DateTime.Now;
            dateTimePicker2.Value = DateTime.Now;
            label18.Text = "เลือกรายการ";
            textBox1.Text = "";
            textBox2.Text = "";
            textBox3.Text = "";
            textBox4.Text = "";
            textBox5.Text = "";
            textBox6.Text = "";
            textBox7.Text = "";
            textBox8.Text = "";
            textBox9.Text = "";
            dataGridView1.DataSource = null;
            dataGridView2.DataSource = null;
            dataGridView3.DataSource = null;
            dataGridView4.DataSource = null;


        }

        private void loadStockRemaining()
        {
            dataGridView1.DataSource = null;
            string strProvider = Form1.connStringMain; ;
            OleDbConnection con = new OleDbConnection(strProvider);
            string strSQL = "SELECT Items.Name1 as ชื่อสินค้า, Stock.Amount as จำนวน FROM Stock INNER JOIN Items ON Stock.ItemID = Items.ID WHERE Stock.Amount>-1 ORDER BY  Stock.Amount";
            OleDbCommand cmd = new OleDbCommand(strSQL, con);
            con.Open();
            //MessageBox.Show("ok");
            cmd.CommandType = CommandType.Text;
            OleDbDataAdapter da = new OleDbDataAdapter(cmd);
            DataTable data = new DataTable();
            da.Fill(data);
            dataGridView1.DataSource = data;
            con.Close();
        }

        private void LoadCashTransaction()
        {
            dataGridView4.DataSource = null;
            string strProvider = Form1.connStringMain; ;
            OleDbConnection con = new OleDbConnection(strProvider);
            string strSQL = "SELECT Cash.Type1 as ประเภท,Cash.Amount as ยอด, Cash.List as รายการ,Cash.Date1 as วันที่ FROM Cash where Cash.Date1<=#" + getDateTime(dateTimePicker2.Value.ToShortDateString())+"# and Date1>=#"+getDateTime(dateTimePicker1.Value.ToShortDateString())+"# Order by Cash.Date1 Desc;";
            OleDbCommand cmd = new OleDbCommand(strSQL, con);
            con.Open();
            //MessageBox.Show("ok");
            cmd.CommandType = CommandType.Text;
            OleDbDataAdapter da = new OleDbDataAdapter(cmd);
            DataTable data = new DataTable();
            da.Fill(data);
            dataGridView4.DataSource = data;
            con.Close();
        }

        private void loadSellfromDate()
        {
            dataGridView2.DataSource = null;
            string strProvider = Form1.connStringMain; ;
            OleDbConnection con = new OleDbConnection(strProvider);
            string strSQL = "SELECT Items.Name1 as สินค้า,sum(Sell.Amount) as จำนวน,sum(Sell.Price) as ยอดเงิน FROM Sell INNER JOIN Items ON Sell.ItemID = Items.ID where Sell.Date1 <=#"+getDatetimePlusTNextday(dateTimePicker2.Value.ToShortDateString())+"# and Sell.Date1>=#"+getDateTime(dateTimePicker1.Value.ToShortDateString())+"#  group by Items.Name1";
            OleDbCommand cmd = new OleDbCommand(strSQL, con);
            con.Open();
            //MessageBox.Show("ok");
            cmd.CommandType = CommandType.Text;
            OleDbDataAdapter da = new OleDbDataAdapter(cmd);
            DataTable data = new DataTable();
            da.Fill(data);
            dataGridView2.DataSource = data;
            con.Close();
        }

        private void loadCostfromDate()
        {
            dataGridView3.DataSource = null;
            string strProvider = Form1.connStringMain; ;
            OleDbConnection con = new OleDbConnection(strProvider);
            string strSQL = "SELECT Account.List as รายการ, Account.Amount as ยอดเงิน, Account.PaymentType as ช่องทาง, Account.Date1 as วันที่, Account.Owner as โดย FROM Account where  (Account.Amount<>0 or Account.Paymenttype='Voucher') and Account.Date1<=#" + getDateTime(dateTimePicker2.Value.ToShortDateString())+"# and  Account.Date1>=#"+getDateTime(dateTimePicker1.Value.ToShortDateString())+ "# Order by Account.Type;";
            OleDbCommand cmd = new OleDbCommand(strSQL, con);
            con.Open();
            //MessageBox.Show("ok");
            cmd.CommandType = CommandType.Text;
            OleDbDataAdapter da = new OleDbDataAdapter(cmd);
            DataTable data = new DataTable();
            da.Fill(data);
            dataGridView3.DataSource = data;
            con.Close();
        }

        string sumCash = "";
        string sumTransfer = "";
        string sumCost = "";
        string TotalSellMonthly = "";
        string TotalCostMonthly = "";

      
             
        private void loadCashAndTransferfromDate()
        {
            textBox4.Text = "";
            textBox5.Text = "";
            textBox6.Text = "";
            textBox7.Text = "";
            sumCash = "0";
            sumTransfer = "0";
            string strProvider = Form1.connStringMain; 
            OleDbConnection connection = new OleDbConnection(strProvider);

            //Total Transfer from date
            string strSQL = "select sum(amount) as Total1 from account where date1<=#"+getDateTime(dateTimePicker2.Value.ToShortDateString())+"# and date1>=#"+getDateTime(dateTimePicker1.Value.ToShortDateString())+"# and type='รายรับ' and Paymenttype='โอน';";
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            connection.Open();
            OleDbDataReader reader = command.ExecuteReader();
            while (reader.Read())
            {
                sumTransfer = reader["Total1"].ToString();
            }
            reader.Close();

            //Total Cash From Date
            strSQL = "select sum(amount) as Total1 from account where date1<=#" + getDateTime(dateTimePicker2.Value.ToShortDateString()) + "# and date1>=#" + getDateTime(dateTimePicker1.Value.ToShortDateString()) + "# and type='รายรับ' and Paymenttype='เงินสด';";
            command = new OleDbCommand(strSQL, connection);
            reader = command.ExecuteReader();
            while (reader.Read())
            {
                sumCash = reader["Total1"].ToString();
            }
            reader.Close();

            //Total Cost From Date
            strSQL = "select sum(amount) as Total1 from account where date1<=#" + getDateTime(dateTimePicker2.Value.ToShortDateString()) + "# and date1>=#" + getDateTime(dateTimePicker1.Value.ToShortDateString()) + "# and type='รายจ่าย';";
            command = new OleDbCommand(strSQL, connection);
            reader = command.ExecuteReader();
            while (reader.Read())
            {
                sumCost = reader["Total1"].ToString();
            }
            reader.Close();


            //Total Sell Monthly
            strSQL = "select sum(amount) as Total1 from account where Month(Date1)="+dateTimePicker1.Value.Month.ToString()+" and Year(date1)="+dateTimePicker1.Value.Year.ToString()+" and type='รายรับ'";
            command = new OleDbCommand(strSQL, connection);
            reader = command.ExecuteReader();
            while (reader.Read())
            {
                TotalSellMonthly = reader["Total1"].ToString();
            }
            reader.Close();

            //Total Cost Monthly
            strSQL = "select sum(amount) as Total1 from account where Month(Date1)=" + dateTimePicker1.Value.Month.ToString() + " and Year(date1)=" + dateTimePicker1.Value.Year.ToString() + " and type='รายจ่าย'";
            command = new OleDbCommand(strSQL, connection);
            reader = command.ExecuteReader();
            while (reader.Read())
            {
                TotalCostMonthly = reader["Total1"].ToString();
            }
            reader.Close();

            connection.Close();
            if (sumCash == "")
                sumCash = "0";
            if (sumTransfer == "")
                sumTransfer = "0";
            if (sumCost == "")
                sumCost = "0";
            if (TotalSellMonthly == "")
                TotalSellMonthly = "0";
            if (TotalCostMonthly == "")
                TotalCostMonthly = "0";
            label18.Text = "เดือน " + dateTimePicker1.Value.Month.ToString();
            textBox5.Text = sumTransfer;
            textBox4.Text = sumCash;
            textBox2.Text = sumCost;
            textBox7.Text = TotalSellMonthly;
            textBox10.Text = TotalCostMonthly;
            textBox6.Text = (Convert.ToDouble(textBox7.Text) - Convert.ToDouble(textBox10.Text)).ToString();
            
            
        }

        private void getCashAndTransferSell()
        {
            textBox8.Text = "";
            textBox9.Text = "";
            string _sumTransfer = "0";
            string _sumCash = "0";
            string strProvider = Form1.connStringMain;
            OleDbConnection connection = new OleDbConnection(strProvider);
            string strSQL = "select sum(Price) as Total1 from Sell where date1<=#" + getDateTime(dateTimePicker2.Value.ToShortDateString()) + "# and date1>=#" + getDateTime(dateTimePicker1.Value.ToShortDateString()) + "# and Paymenttype='โอน';";
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            connection.Open();
            OleDbDataReader reader = command.ExecuteReader();
            while (reader.Read())
            {
                _sumTransfer = reader["Total1"].ToString();
            }
            reader.Close();

            strSQL = "select sum(Price) as Total1 from Sell where date1<=#" + getDateTime(dateTimePicker2.Value.ToShortDateString()) + "# and date1>=#" + getDateTime(dateTimePicker1.Value.ToShortDateString()) + "# and Paymenttype='เงินสด';";
            command = new OleDbCommand(strSQL, connection);
            reader = command.ExecuteReader();
            while (reader.Read())
            {
                _sumCash = reader["Total1"].ToString();
            }
            reader.Close();
            connection.Close();
            textBox8.Text = _sumTransfer;
            textBox9.Text = _sumCash;
        }



        private void button2_Click(object sender, EventArgs e)
        {
            reset();
        }

        private void ReportForm_Load(object sender, EventArgs e)
        {
            
        }

        double totalIncome = 0;
        double totalcost = 0;
        private void sumAccount()
        {
            textBox1.Text = "0";
            textBox2.Text = "0";
            textBox6.Text = "0";

            totalIncome = 0;
            int i = dataGridView2.RowCount - 1;
            if (i!=0)
            {
                for (int j=0;j< i;j++)
                {
                    totalIncome = totalIncome + Convert.ToDouble(dataGridView2.Rows[j].Cells[2].Value.ToString());
                }
            }
            i = dataGridView3.RowCount - 1;
            if (i != 0)
            {
                for (int j = 0; j < i; j++)
                {
                    totalcost = totalcost + Convert.ToDouble(dataGridView3.Rows[j].Cells[1].Value.ToString());
                }
            }

            textBox1.Text = totalIncome.ToString();
           // textBox2.Text = totalcost.ToString();
            textBox6.Text = (totalIncome - totalcost).ToString();
        }

        private string getDateTime(string date)
        {
            string dateNewFormat = Convert.ToDateTime(date).ToString("MM/dd/yyyy", System.Globalization.CultureInfo.InvariantCulture);
            return dateNewFormat;

        }

        private string getDatetimePlusTNextday(string date)
        {
            DateTime _date = Convert.ToDateTime(date).AddDays(1);
            return _date.ToString("MM/dd/yyyy", System.Globalization.CultureInfo.InvariantCulture) + " 02:00 PM";
        }

        private void button4_Click(object sender, EventArgs e)
        {
            reset();
            dateTimePicker1.Value = DateTime.Now;
            dateTimePicker2.Value = DateTime.Now;
            loadStockRemaining();
            loadSellfromDate();
            loadCostfromDate();
            sumAccount();
            textBox3.Text = Form1.getTotalCash(getDateTime(dateTimePicker2.Value.ToShortDateString())).ToString();

        }

        Form2 f2;
        private void button5_Click(object sender, EventArgs e)
        {
            try
            {
                f2.Dispose();
            }
            catch (Exception)
            {

            }
            f2 = new Form2();
            f2.Show();
        }

        private void LoadVoucherAmount()
        {
            int _amountVoucherIssue = 0;
            int _amountVoucherUsed = 0;
            string strSQL = "SELECT count(ID) AS TOTAL1 FROM ACCOUNT WHERE DATE1>=#"+Form1.getDateTime(dateTimePicker1.Value.ToShortDateString())+"# and date1<=#"+Form1.getDateTime(dateTimePicker2.Value.ToShortDateString())+"# AND PaymentType='Voucher'";
            OleDbConnection connection = new OleDbConnection(Form1.connStringMain);
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            connection.Open();
            OleDbDataReader reader = command.ExecuteReader();
            while (reader.Read())
            {
                try
                {
                    _amountVoucherUsed = Convert.ToInt16(reader["Total1"].ToString());
                }
                catch (Exception)
                {

                }
            }
            reader.Close();
            connection.Close();
            connection = new OleDbConnection(Form1.VoucherconnStringMain);
            strSQL = "SELECT count(ID) AS TOTAL1 FROM Voucher WHERE DATE1>=#" + Form1.getDateTime(dateTimePicker1.Value.ToShortDateString()) + "# and date1<=#" + Form1.getDateTime(dateTimePicker2.Value.ToShortDateString()) + "#";
            command = new OleDbCommand(strSQL, connection);
            connection.Open();
            reader = command.ExecuteReader();
            while (reader.Read())
            {
                try
                {
                    _amountVoucherIssue = Convert.ToInt16(reader["Total1"].ToString());
                }
                catch (Exception)
                {

                }
            }
            reader.Close();
            connection.Close();
            label17.Text = "จำนวน Voucher ที่แจกทั้งหมด : " + _amountVoucherIssue.ToString() + " นำมาใช้ทั้งหมด : " + _amountVoucherUsed;
        }

        private void LoadVoucher()
        {

        }

        private void button4_Click_1(object sender, EventArgs e)
        {
            dateTimePicker1.Value = DateTime.Now;
            dateTimePicker2.Value = DateTime.Now;
            LoadVoucher();
            getFullReport();

        }
    }
}
